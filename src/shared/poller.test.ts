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
});
