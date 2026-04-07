import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pollStatus } from "./poller";
import { ScalewayClient } from "./client";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("pollStatus", () => {
  const client = new ScalewayClient({
    secretKey: "test-key",
    region: "fr-par",
  });

  it("returns immediately if first poll matches a success status", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: "ready", domain_name: "test.scw.cloud" }),
    );

    const result = await pollStatus(client, {
      url: "/containers/v1beta1/regions/{region}/containers/abc",
      successStatuses: new Set(["ready"]),
      failureStatuses: new Set(["error"]),
      timeoutMs: 10_000,
      intervalMs: 100,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("ready");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("polls until success status is reached", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ status: "pending" }))
      .mockResolvedValueOnce(jsonResponse({ status: "creating" }))
      .mockResolvedValueOnce(jsonResponse({ status: "ready", domain_name: "test.scw.cloud" }));

    const result = await pollStatus(client, {
      url: "/containers/v1beta1/regions/{region}/containers/abc",
      successStatuses: new Set(["ready"]),
      failureStatuses: new Set(["error"]),
      timeoutMs: 30_000,
      intervalMs: 50,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("ready");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws on failure status", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: "error", error_message: "Image pull failed" }),
    );

    await expect(
      pollStatus(client, {
        url: "/containers/v1beta1/regions/{region}/containers/abc",
        successStatuses: new Set(["ready"]),
        failureStatuses: new Set(["error"]),
        timeoutMs: 10_000,
        intervalMs: 100,
      }),
    ).rejects.toThrow('Resource entered failure status "error": Image pull failed');
  });

  it("throws on timeout", async () => {
    // Always return pending
    mockFetch.mockResolvedValue(jsonResponse({ status: "pending" }));

    await expect(
      pollStatus(client, {
        url: "/containers/v1beta1/regions/{region}/containers/abc",
        successStatuses: new Set(["ready"]),
        failureStatuses: new Set(["error"]),
        timeoutMs: 200,
        intervalMs: 50,
      }),
    ).rejects.toThrow("Polling timed out");
  });

  it("falls back to 'unknown' status when statusField is absent from response", async () => {
    // First response has no status field at all; second has the success status
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ domain_name: "no-status.scw.cloud" }))
      .mockResolvedValueOnce(jsonResponse({ status: "ready", domain_name: "test.scw.cloud" }));

    const result = await pollStatus(client, {
      url: "/containers/v1beta1/regions/{region}/containers/abc",
      successStatuses: new Set(["ready"]),
      failureStatuses: new Set(["error"]),
      timeoutMs: 10_000,
      intervalMs: 50,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("ready");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("uses a custom statusField when provided", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ job_status: "succeeded", id: "jr-1" }),
    );

    const result = await pollStatus(client, {
      url: "/serverless-jobs/v1alpha1/regions/{region}/job-runs/jr-1",
      statusField: "job_status",
      successStatuses: new Set(["succeeded"]),
      failureStatuses: new Set(["failed"]),
      timeoutMs: 10_000,
      intervalMs: 50,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("succeeded");
  });

  it("throws with 'Unknown error' when failure response has no error_message", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: "error" }),
    );

    await expect(
      pollStatus(client, {
        url: "/containers/v1beta1/regions/{region}/containers/abc",
        successStatuses: new Set(["ready"]),
        failureStatuses: new Set(["error"]),
        timeoutMs: 10_000,
        intervalMs: 50,
      }),
    ).rejects.toThrow("Unknown error");
  });
});
