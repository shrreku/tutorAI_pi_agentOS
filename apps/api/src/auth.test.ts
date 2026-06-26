import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { betaConsents, userProductState, users } from "@studyagent/db";
import type { AppContext } from "./context.js";
import {
  AuthError,
  createSession,
  parseWorkOSCallbackCodeForDev,
  readSessionToken,
  resetCachedDevActorForTests,
  resolveActor,
  upsertHostedUser,
} from "./auth.js";
import { registerAuthRoutes } from "./routes/auth.js";

type UserRow = {
  id: string;
  email: string;
  displayName?: string | null;
  workosUserId?: string | null;
  disabledAt?: Date | null;
  settingsJson?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
};

type ProductStateRow = {
  userId: string;
  studyAccess: number;
  ingestionAccess: number;
  adminAccess: number;
  pilotTagsJson: string[];
  onboardingJson: Record<string, unknown>;
  trialBudgetGrantedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function createAuthTestContext(options?: {
  disableAuth?: boolean;
  devUserEmail?: string;
  sessionSecret?: string;
  workos?: boolean;
  publicWebBaseUrl?: string;
  workosRedirectUri?: string;
}) {
  const userRows: UserRow[] = [];
  const productStateRows: ProductStateRow[] = [];

  if (options?.disableAuth ?? true) {
    userRows.push({
      id: "usr_dev",
      email: options?.devUserEmail ?? "dev@studyagent.local",
      settingsJson: {},
    });
  }

  const db = {
    select() {
      return {
        from(table: unknown) {
          return {
            where(condition: unknown) {
              void condition;
              if (table === users) {
                return {
                  limit: async (count: number) => userRows.slice(0, count),
                };
              }
              if (table === userProductState) {
                return {
                  limit: async (count: number) => productStateRows.slice(0, count),
                };
              }
              return {
                limit: async () => [],
              };
            },
            orderBy(_order: unknown) {
              return {
                limit: async (count: number) => {
                  if (table === betaConsents) {
                    return [];
                  }
                  return productStateRows.slice(0, count);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          const insertRow = async () => {
            if (table === users) {
              userRows.push(row as UserRow);
            }
            if (table === userProductState) {
              productStateRows.push(row as ProductStateRow);
            }
          };

          return {
            onConflictDoNothing: async () => {
              await insertRow();
            },
            then(
              onFulfilled: (value: unknown) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              return insertRow().then(onFulfilled, onRejected);
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set: (patch: Record<string, unknown>) => ({
          where: async (condition: unknown) => {
            void condition;
            if (table === users && typeof patch.email === "string") {
              const row = userRows[0];
              if (row) {
                row.email = patch.email;
                row.updatedAt = patch.updatedAt as Date;
              }
            }
          },
        }),
      };
    },
  };

  const ctx = {
    env: {
      DISABLE_AUTH: options?.disableAuth ?? true,
      DEV_USER_EMAIL: options?.devUserEmail ?? "dev@studyagent.local",
      SESSION_SECRET: options?.sessionSecret ?? "studyagent-local-session-secret",
      BETA_CONSENT_VERSION: "2026-06-17",
      PUBLIC_WEB_BASE_URL: options?.publicWebBaseUrl ?? "http://localhost:5173",
      PUBLIC_API_BASE_URL: "http://localhost:4000",
      WORKOS_API_KEY: options?.workos ? "sk_test_workos" : undefined,
      WORKOS_CLIENT_ID: options?.workos ? "client_test_workos" : undefined,
      WORKOS_COOKIE_PASSWORD: options?.workos ? "x".repeat(32) : undefined,
      WORKOS_REDIRECT_URI: options?.workos
        ? (options.workosRedirectUri ?? "https://tutorbook.me/auth/callback")
        : undefined,
    },
    db: { db },
  } as unknown as AppContext;

  return { ctx, userRows, productStateRows };
}

describe("auth", () => {
  beforeEach(() => {
    resetCachedDevActorForTests();
  });

  it("resolves the seeded dev user when DISABLE_AUTH is true", async () => {
    const { ctx } = createAuthTestContext({ disableAuth: true });
    const request = { headers: {} } as Parameters<typeof resolveActor>[1];

    await expect(resolveActor(ctx, request)).resolves.toEqual({
      id: "usr_dev",
      email: "dev@studyagent.local",
    });
  });

  it("resolves a dev session cookie before falling back to the seeded dev user", async () => {
    const { ctx, userRows } = createAuthTestContext({ disableAuth: true });
    userRows.unshift({ id: "usr_session", email: "session@studyagent.local", settingsJson: {} });
    const reply = {
      headers: {} as Record<string, string | string[] | undefined>,
      header(name: string, value: string) {
        this.headers[name] = value;
      },
    };

    createSession(reply as never, ctx, { id: "usr_session", email: "session@studyagent.local" });
    const setCookie = String(reply.headers["Set-Cookie"]);
    const token = decodeURIComponent(setCookie.split("=")[1]?.split(";")[0] ?? "");
    const request = {
      headers: { cookie: `sa_session=${token}` },
    } as Parameters<typeof resolveActor>[1];

    await expect(resolveActor(ctx, request)).resolves.toEqual({
      id: "usr_session",
      email: "session@studyagent.local",
    });
  });

  it("resolves a user from X-User-Id in dev mode", async () => {
    const { ctx, userRows } = createAuthTestContext({ disableAuth: true });
    userRows.length = 0;
    userRows.push({ id: "usr_alt", email: "alt@studyagent.local", settingsJson: {} });
    const request = { headers: { "x-user-id": "usr_alt" } } as unknown as Parameters<
      typeof resolveActor
    >[1];

    await expect(resolveActor(ctx, request)).resolves.toEqual({
      id: "usr_alt",
      email: "alt@studyagent.local",
    });
  });

  it("rejects unauthenticated hosted requests", async () => {
    const { ctx } = createAuthTestContext({ disableAuth: false });
    const request = { headers: {} } as Parameters<typeof resolveActor>[1];

    await expect(resolveActor(ctx, request)).rejects.toMatchObject({
      code: "unauthenticated",
      statusCode: 401,
    });
  });

  it("creates and reads a sealed session cookie", async () => {
    const { ctx } = createAuthTestContext({ disableAuth: false });
    const reply = {
      headers: {} as Record<string, string | string[] | undefined>,
      header(name: string, value: string) {
        this.headers[name] = value;
      },
    };

    createSession(reply as never, ctx, { id: "usr_session", email: "session@studyagent.local" });
    const setCookie = reply.headers["Set-Cookie"];
    expect(typeof setCookie).toBe("string");

    const token = String(setCookie).split("=")[1]?.split(";")[0];
    expect(token).toBeTruthy();

    const request = {
      headers: {
        cookie: `sa_session=${decodeURIComponent(token ?? "")}`,
      },
    } as Parameters<typeof readSessionToken>[0];

    expect(readSessionToken(request)).toBe(decodeURIComponent(token ?? ""));
  });

  it("upserts a hosted user and default product state on first login", async () => {
    const { ctx, userRows, productStateRows } = createAuthTestContext({ disableAuth: false });

    const actor = await upsertHostedUser(ctx, {
      email: "new@studyagent.local",
      workosUserId: "workos_new",
    });

    expect(actor.email).toBe("new@studyagent.local");
    expect(userRows.some((row) => row.email === "new@studyagent.local")).toBe(true);
    expect(productStateRows).toHaveLength(1);
    expect(productStateRows[0]).toMatchObject({
      studyAccess: 1,
      ingestionAccess: 0,
      adminAccess: 0,
    });
  });
});

describe("auth routes", () => {
  let app = Fastify();

  afterEach(async () => {
    await app.close();
    resetCachedDevActorForTests();
  });

  it("returns unauthenticated session payload in hosted mode", async () => {
    const { ctx } = createAuthTestContext({ disableAuth: false });
    app = Fastify();
    await registerAuthRoutes(app, ctx);

    const response = await app.inject({ method: "GET", url: "/auth/session" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      authenticated: false,
      code: "unauthenticated",
    });
  });

  it("supports dev-login and logout in DISABLE_AUTH mode", async () => {
    const { ctx } = createAuthTestContext({ disableAuth: true });
    app = Fastify();
    await registerAuthRoutes(app, ctx);

    const login = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev@studyagent.local" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(cookie).toBeTruthy();

    const session = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: String(cookie).split(";")[0] },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      authenticated: true,
      actor: { email: "dev@studyagent.local" },
      mode: "dev",
    });

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: String(cookie).split(";")[0] },
    });
    expect(logout.statusCode).toBe(200);
    const setCookie = logout.headers["set-cookie"];
    const cookieHeaders = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
    expect(cookieHeaders.some((header) => header.includes("Max-Age=0"))).toBe(true);
  });

  it("does not expose dev-login in hosted mode", async () => {
    const { ctx } = createAuthTestContext({ disableAuth: false });
    app = Fastify();
    await registerAuthRoutes(app, ctx);

    const response = await app.inject({
      method: "POST",
      url: "/auth/dev-login",
      payload: { email: "dev@studyagent.local" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("redirects to WorkOS AuthKit when hosted auth is configured", async () => {
    const { ctx } = createAuthTestContext({
      disableAuth: false,
      workos: true,
      publicWebBaseUrl: "https://tutorbook.me",
      workosRedirectUri: "https://tutorbook.me/auth/callback",
    });
    app = Fastify();
    await registerAuthRoutes(app, ctx);

    const response = await app.inject({ method: "GET", url: "/auth/login" });

    expect(response.statusCode).toBe(302);
    const location = new URL(String(response.headers.location));
    expect(location.origin).toBe("https://api.workos.com");
    expect(location.pathname).toBe("/user_management/authorize");
    expect(location.searchParams.get("client_id")).toBe("client_test_workos");
    expect(location.searchParams.get("redirect_uri")).toBe("https://tutorbook.me/auth/callback");
    expect(location.searchParams.get("provider")).toBe("authkit");
  });

  it("creates a hosted session from callback code", async () => {
    const { ctx } = createAuthTestContext({ disableAuth: false });
    app = Fastify();
    await registerAuthRoutes(app, ctx);

    const response = await app.inject({
      method: "GET",
      url: "/auth/callback?code=callback-user@studyagent.local",
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("http://localhost:5173/app");
    expect(response.headers["set-cookie"]).toContain("sa_session=");
  });

  it("rejects dev callback in production when WorkOS is unconfigured", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const { ctx } = createAuthTestContext({ disableAuth: false });
      app = Fastify();
      await registerAuthRoutes(app, ctx);

      const response = await app.inject({
        method: "GET",
        url: "/auth/callback?code=callback-user@studyagent.local",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: "workos_unconfigured" });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

describe("AuthError", () => {
  it("carries code and status", () => {
    const error = new AuthError("invalid_session", "bad session", 401);
    expect(error.code).toBe("invalid_session");
    expect(error.statusCode).toBe(401);
  });
});

describe("parseWorkOSCallbackCodeForDev", () => {
  it("parses email-shaped callback codes", () => {
    expect(parseWorkOSCallbackCodeForDev("Learner@Example.com")).toEqual({
      email: "learner@example.com",
      workosUserId: expect.stringMatching(/^workos_dev_/),
    });
  });

  it("parses opaque callback codes into synthetic dev identities", () => {
    expect(parseWorkOSCallbackCodeForDev("workos_abc")).toEqual({
      email: "workos_abc@workos-dev.studyagent.local",
      workosUserId: "workos_abc",
    });
  });
});
