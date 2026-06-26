import { createHmac, timingSafeEqual } from "node:crypto";
import { WorkOS } from "@workos-inc/node";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { userProductState, users } from "@studyagent/db";
import type { AppContext } from "./context.js";

export type Actor = { id: string; email: string };

export const SESSION_COOKIE_NAME = "sa_session";
export const WORKOS_SESSION_COOKIE_NAME = "wos_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  email: string;
  workosUserId?: string | null;
  iat: number;
  exp: number;
};

let cachedDevActor: Actor | null = null;
let cachedWorkOSClient: WorkOS | null = null;

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function sealPayload(payload: SessionPayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function unsealPayload(token: string, secret: string): SessionPayload | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const data = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", secret).update(data).digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function readSessionToken(request: FastifyRequest): string | null {
  return readCookie(request, SESSION_COOKIE_NAME);
}

function readCookie(request: FastifyRequest, name: string): string | null {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[name];
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function createSession(
  reply: FastifyReply,
  ctx: AppContext,
  actor: Actor,
  options?: { workosUserId?: string | null },
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    userId: actor.id,
    email: actor.email,
    workosUserId: options?.workosUserId ?? null,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const token = sealPayload(payload, ctx.env.SESSION_SECRET);
  reply.header(
    "Set-Cookie",
    buildSetCookieHeader(SESSION_COOKIE_NAME, token, {
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure: isProductionRequest(ctx),
    }),
  );
  return token;
}

export function clearSession(reply: FastifyReply, ctx?: AppContext): void {
  reply.header(
    "Set-Cookie",
    [
      buildSetCookieHeader(SESSION_COOKIE_NAME, "", {
        maxAge: 0,
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        secure: ctx ? isProductionRequest(ctx) : false,
      }),
      buildSetCookieHeader(WORKOS_SESSION_COOKIE_NAME, "", {
        maxAge: 0,
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        secure: ctx ? isProductionRequest(ctx) : false,
      }),
    ],
  );
}

export function createWorkOSSession(reply: FastifyReply, ctx: AppContext, sealedSession: string): void {
  reply.header(
    "Set-Cookie",
    buildSetCookieHeader(WORKOS_SESSION_COOKIE_NAME, sealedSession, {
      maxAge: SESSION_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure: isProductionRequest(ctx),
    }),
  );
}

function isProductionRequest(ctx: AppContext): boolean {
  return process.env.NODE_ENV === "production" || ctx.env.PUBLIC_WEB_BASE_URL.startsWith("https://");
}

function buildSetCookieHeader(
  name: string,
  value: string,
  options: {
    maxAge: number;
    httpOnly: boolean;
    sameSite: "Lax" | "Strict" | "None";
    path: string;
    secure?: boolean;
  },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`];
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildWorkOSAuthorizeUrl(ctx: AppContext): string {
  if (!ctx.env.WORKOS_CLIENT_ID) {
    throw new Error("WORKOS_CLIENT_ID is required for WorkOS login");
  }

  const redirectUri =
    ctx.env.WORKOS_REDIRECT_URI ?? `${ctx.env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}/auth/callback`;
  const params = new URLSearchParams({
    client_id: ctx.env.WORKOS_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    provider: "authkit",
  });
  return `https://api.workos.com/user_management/authorize?${params.toString()}`;
}

export function isWorkOSConfigured(ctx: AppContext): boolean {
  return Boolean(ctx.env.WORKOS_API_KEY && ctx.env.WORKOS_CLIENT_ID && ctx.env.WORKOS_COOKIE_PASSWORD);
}

function getWorkOSClient(ctx: AppContext): WorkOS {
  if (!ctx.env.WORKOS_API_KEY || !ctx.env.WORKOS_CLIENT_ID) {
    throw new AuthError("workos_unconfigured", "WorkOS is not configured.", 503);
  }
  if (!cachedWorkOSClient) {
    cachedWorkOSClient = new WorkOS(ctx.env.WORKOS_API_KEY, {
      clientId: ctx.env.WORKOS_CLIENT_ID,
    });
  }
  return cachedWorkOSClient;
}

async function ensureDefaultProductState(ctx: AppContext, userId: string): Promise<void> {
  const [existing] = await ctx.db.db
    .select({ userId: userProductState.userId })
    .from(userProductState)
    .where(eq(userProductState.userId, userId))
    .limit(1);
  if (existing) {
    return;
  }

  const now = new Date();
  await ctx.db.db.insert(userProductState).values({
    userId,
    studyAccess: 1,
    ingestionAccess: 0,
    adminAccess: 0,
    pilotTagsJson: [],
    onboardingJson: {},
    createdAt: now,
    updatedAt: now,
  });
}

export async function upsertHostedUser(
  ctx: AppContext,
  input: { email: string; workosUserId?: string | null; displayName?: string | null },
): Promise<Actor> {
  const now = new Date();
  const normalizedEmail = input.email.trim().toLowerCase();
  const workosUserId = input.workosUserId?.trim() || null;

  let existing:
    | {
        id: string;
        email: string;
        disabledAt: Date | null;
      }
    | undefined;

  if (workosUserId) {
    [existing] = await ctx.db.db
      .select({ id: users.id, email: users.email, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.workosUserId, workosUserId))
      .limit(1);
  }

  if (!existing) {
    [existing] = await ctx.db.db
      .select({ id: users.id, email: users.email, disabledAt: users.disabledAt })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
  }

  if (existing) {
    await ctx.db.db
      .update(users)
      .set({
        email: normalizedEmail,
        displayName: input.displayName ?? undefined,
        workosUserId: workosUserId ?? undefined,
        updatedAt: now,
      })
      .where(eq(users.id, existing.id));

    if (existing.disabledAt) {
      throw new AuthError("user_disabled", "This account has been disabled.", 403);
    }

    await ensureDefaultProductState(ctx, existing.id);
    return { id: existing.id, email: normalizedEmail };
  }

  const id = `usr_${crypto.randomUUID().replaceAll("-", "")}`;
  await ctx.db.db.insert(users).values({
    id,
    email: normalizedEmail,
    displayName: input.displayName ?? null,
    workosUserId,
    settingsJson: {},
    createdAt: now,
    updatedAt: now,
  });

  await ensureDefaultProductState(ctx, id);
  return { id, email: normalizedEmail };
}

async function resolveDevActor(ctx: AppContext, request: FastifyRequest): Promise<Actor> {
  const headerUserId = request.headers["x-user-id"];
  if (typeof headerUserId === "string" && headerUserId.length > 0) {
    const [row] = await ctx.db.db.select().from(users).where(eq(users.id, headerUserId)).limit(1);
    if (!row) {
      throw new AuthError("unknown_user", `Unknown X-User-Id: ${headerUserId}`, 401);
    }
    if (row.disabledAt) {
      throw new AuthError("user_disabled", "This account has been disabled.", 403);
    }
    return { id: row.id, email: row.email };
  }

  if (cachedDevActor) {
    return cachedDevActor;
  }

  const [row] = await ctx.db.db
    .select()
    .from(users)
    .where(eq(users.email, ctx.env.DEV_USER_EMAIL))
    .limit(1);

  if (!row) {
    throw new AuthError(
      "dev_user_missing",
      `No user found for DEV_USER_EMAIL=${ctx.env.DEV_USER_EMAIL}. Run: pnpm --filter @studyagent/db seed`,
      500,
    );
  }

  if (row.disabledAt) {
    throw new AuthError("user_disabled", "This account has been disabled.", 403);
  }

  cachedDevActor = { id: row.id, email: row.email };
  return cachedDevActor;
}

async function resolveHostedActor(ctx: AppContext, request: FastifyRequest): Promise<Actor> {
  const sealedSession = readCookie(request, WORKOS_SESSION_COOKIE_NAME);
  if (!sealedSession) {
    throw new AuthError("unauthenticated", "Authentication required.", 401);
  }
  if (!ctx.env.WORKOS_COOKIE_PASSWORD) {
    throw new AuthError("workos_unconfigured", "WORKOS_COOKIE_PASSWORD is required for hosted sessions.", 503);
  }

  const session = getWorkOSClient(ctx).userManagement.loadSealedSession({
    sessionData: sealedSession,
    cookiePassword: ctx.env.WORKOS_COOKIE_PASSWORD,
  });
  const auth = await session.authenticate();
  if (!auth.authenticated) {
    throw new AuthError("invalid_session", "WorkOS session is invalid or expired.", 401);
  }

  const displayName =
    auth.user.name ?? ([auth.user.firstName, auth.user.lastName].filter(Boolean).join(" ").trim() || null);
  return upsertHostedUser(ctx, {
    email: auth.user.email,
    workosUserId: auth.user.id,
    displayName,
  });
}

export async function resolveActor(ctx: AppContext, request: FastifyRequest): Promise<Actor> {
  if (ctx.env.DISABLE_AUTH) {
    const token = readSessionToken(request);
    if (token) {
      const payload = unsealPayload(token, ctx.env.SESSION_SECRET);
      if (payload) {
        const [row] = await ctx.db.db
          .select()
          .from(users)
          .where(eq(users.id, payload.userId))
          .limit(1);
        if (row && !row.disabledAt) {
          return { id: row.id, email: row.email };
        }
      }
    }
    return resolveDevActor(ctx, request);
  }
  return resolveHostedActor(ctx, request);
}

export async function requireActor(ctx: AppContext, request: FastifyRequest): Promise<Actor> {
  try {
    return await resolveActor(ctx, request);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError("unauthenticated", "Authentication required.", 401);
  }
}

export function resetCachedDevActorForTests(): void {
  cachedDevActor = null;
  cachedWorkOSClient = null;
}

export type WorkOSIdentity = {
  email: string;
  workosUserId: string;
  displayName?: string | null;
  sealedSession?: string | null;
};

export async function exchangeWorkOSCode(ctx: AppContext, code: string): Promise<WorkOSIdentity> {
  if (!ctx.env.WORKOS_API_KEY || !ctx.env.WORKOS_CLIENT_ID || !ctx.env.WORKOS_COOKIE_PASSWORD) {
    throw new AuthError("workos_unconfigured", "WorkOS is not configured.", 503);
  }

  try {
    const response = await getWorkOSClient(ctx).userManagement.authenticateWithCode({
      clientId: ctx.env.WORKOS_CLIENT_ID,
      code: code.trim(),
      session: {
        sealSession: true,
        cookiePassword: ctx.env.WORKOS_COOKIE_PASSWORD,
      },
    });
    if (!response.sealedSession) {
      throw new AuthError("workos_auth_failed", "WorkOS response did not include a sealed session.", 401);
    }
    const displayName =
      response.user.name ??
      ([response.user.firstName, response.user.lastName].filter(Boolean).join(" ").trim() || null);
    return {
      email: response.user.email.toLowerCase(),
      workosUserId: response.user.id,
      displayName,
      sealedSession: response.sealedSession,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(
      "workos_auth_failed",
      `WorkOS authentication failed. ${error instanceof Error ? error.message.slice(0, 200) : ""}`,
      401,
    );
  }
}

/** Dev/test only when WorkOS is not configured. Never used in production. */
export function parseWorkOSCallbackCodeForDev(code: string): WorkOSIdentity {
  const trimmed = code.trim();
  if (trimmed.includes("@")) {
    return {
      email: trimmed.toLowerCase(),
      workosUserId: `workos_dev_${Buffer.from(trimmed).toString("base64url")}`,
    };
  }
  return {
    email: `${trimmed}@workos-dev.studyagent.local`,
    workosUserId: trimmed.startsWith("workos_") ? trimmed : `workos_${trimmed}`,
  };
}
