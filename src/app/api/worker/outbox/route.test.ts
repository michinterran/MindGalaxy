import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleOutboxDrain } from "@/app/api/worker/outbox/route";

vi.mock("server-only", () => ({}));

const secret = "analysis-worker-secret-at-least-24-chars";

afterEach(() => {
  delete process.env.ANALYSIS_WORKER_SECRET;
});

describe("analysis outbox worker route", () => {
  it("rejects requests without the worker secret", async () => {
    process.env.ANALYSIS_WORKER_SECRET = secret;
    const drain = vi.fn();
    const response = await handleOutboxDrain(
      new NextRequest("http://localhost/api/worker/outbox", { method: "POST" }),
      drain,
    );

    expect(response.status).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });

  it("drains a bounded batch for an authorized worker", async () => {
    process.env.ANALYSIS_WORKER_SECRET = secret;
    const drain = vi.fn().mockResolvedValue({
      claimed: 1,
      published: 1,
      retried: 0,
      failed: 0,
      eventIds: ["event-1"],
    });
    const response = await handleOutboxDrain(
      new NextRequest("http://localhost/api/worker/outbox", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 5 }),
      }),
      drain,
    );

    expect(response.status).toBe(200);
    expect(drain).toHaveBeenCalledWith(5);
  });
});
