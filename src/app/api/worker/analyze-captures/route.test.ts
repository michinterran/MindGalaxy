import { describe, expect, it } from "vitest";
import { workerAuthError } from "@/app/api/worker/analyze-captures/auth";

const env = {
  ANALYSIS_WORKER_SECRET: "a".repeat(24),
};

describe("workerAuthError", () => {
  it("returns 503 when worker env is missing", () => {
    expect(workerAuthError(null, env.ANALYSIS_WORKER_SECRET)).toEqual({
      error: "WORKER_NOT_CONFIGURED",
      status: 503,
    });
  });

  it("keeps invalid bearer tokens as 401", () => {
    expect(workerAuthError(env, "wrong-token")).toEqual({
      error: "WORKER_UNAUTHORIZED",
      status: 401,
    });
  });

  it("accepts a matching bearer token", () => {
    expect(workerAuthError(env, env.ANALYSIS_WORKER_SECRET)).toBeNull();
  });
});
