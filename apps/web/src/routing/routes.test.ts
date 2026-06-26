import { describe, expect, it } from "vitest";
import {
  isAdminRoute,
  isEvalRunsRoute,
  isProtectedRoute,
  matchRoute,
  requiresConsent,
} from "./routes.js";

describe("matchRoute", () => {
  it("matches public landing and marketing routes", () => {
    expect(matchRoute("/")).toEqual({ kind: "public", page: "landing" });
    expect(matchRoute("/demo")).toEqual({ kind: "public", page: "demo" });
    expect(matchRoute("/login")).toEqual({ kind: "public", page: "login" });
    expect(matchRoute("/auth/callback")).toEqual({ kind: "public", page: "auth-callback" });
  });

  it("matches protected learner routes", () => {
    expect(matchRoute("/app")).toEqual({ kind: "app", page: "dashboard" });
    expect(matchRoute("/app/consent")).toEqual({ kind: "app", page: "consent" });
    expect(matchRoute("/app/templates/st_123")).toEqual({
      kind: "app",
      page: "template-detail",
      templateId: "st_123",
    });
    expect(matchRoute("/app/credits")).toEqual({ kind: "app", page: "credits" });
  });

  it("matches admin and notebook workspace routes", () => {
    expect(matchRoute("/admin")).toEqual({ kind: "admin", page: "overview" });
    expect(matchRoute("/admin/templates")).toEqual({ kind: "admin", page: "templates" });
    expect(matchRoute("/admin/users/usr_1")).toEqual({
      kind: "admin",
      page: "user-detail",
      userId: "usr_1",
    });
    expect(matchRoute("/admin/account-deletion")).toEqual({
      kind: "admin",
      page: "account-deletion",
    });
    expect(matchRoute("/notebooks")).toEqual({ kind: "notebooks-list" });
    expect(matchRoute("/notebooks/nb_1")).toEqual({ kind: "notebook", notebookId: "nb_1" });
    expect(matchRoute("/eval-runs/run_1")).toEqual({ kind: "eval-runs", runId: "run_1" });
  });

  it("normalizes trailing slashes", () => {
    expect(matchRoute("/app/")).toEqual({ kind: "app", page: "dashboard" });
    expect(matchRoute("/demo/")).toEqual({ kind: "public", page: "demo" });
  });

  it("returns unknown for unsupported paths", () => {
    expect(matchRoute("/legacy")).toEqual({ kind: "unknown" });
  });
});

describe("route guards helpers", () => {
  it("identifies protected and admin routes", () => {
    expect(isProtectedRoute(matchRoute("/"))).toBe(false);
    expect(isProtectedRoute(matchRoute("/app"))).toBe(true);
    expect(isProtectedRoute(matchRoute("/eval-runs"))).toBe(true);
    expect(isEvalRunsRoute(matchRoute("/eval-runs"))).toBe(true);
    expect(isAdminRoute(matchRoute("/admin/users"))).toBe(true);
    expect(isAdminRoute(matchRoute("/app"))).toBe(false);
  });

  it("requires consent for app routes except consent page", () => {
    expect(requiresConsent(matchRoute("/app"))).toBe(true);
    expect(requiresConsent(matchRoute("/app/consent"))).toBe(false);
    expect(requiresConsent(matchRoute("/notebooks"))).toBe(true);
    expect(requiresConsent(matchRoute("/notebooks/nb_1"))).toBe(true);
    expect(requiresConsent(matchRoute("/app/credits"))).toBe(true);
    expect(requiresConsent(matchRoute("/app/support"))).toBe(true);
  });

  it("treats admin and eval routes as protected but not consent-gated at route level", () => {
    expect(isProtectedRoute(matchRoute("/admin"))).toBe(true);
    expect(requiresConsent(matchRoute("/admin"))).toBe(false);
    expect(isProtectedRoute(matchRoute("/eval-runs"))).toBe(true);
    expect(requiresConsent(matchRoute("/eval-runs"))).toBe(false);
  });
});
