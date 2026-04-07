import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ScalewayClient,
  ScalewayApiError,
  formatScalewayErrorMessage,
  isTransientResourceError,
  postContainerDeploy,
} from "./client";

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

describe("ScalewayClient", () => {
  const client = new ScalewayClient({
    secretKey: "test-secret-key",
    region: "fr-par",
  });

  it("builds URLs with region substitution", () => {
    const url = client.buildUrl("/containers/v1beta1/regions/{region}/containers");
    expect(url).toBe(
      "https://api.scaleway.com/containers/v1beta1/regions/fr-par/containers",
    );
  });

  it("sends GET requests with auth header", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "abc" }));

    const result = await client.get<{ id: string }>(
      "/containers/v1beta1/regions/{region}/containers/abc",
    );

    expect(result.id).toBe("abc");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("fr-par");
    expect(opts.method).toBe("GET");
    expect(opts.headers["X-Auth-Token"]).toBe("test-secret-key");
  });

  it("sends POST requests with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "new-123" }, 201));

    const result = await client.post<{ id: string }>(
      "/containers/v1beta1/regions/{region}/containers",
      { name: "my-container" },
    );

    expect(result.id).toBe("new-123");
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ name: "my-container" });
  });

  it("handles 204 No Content for DELETE", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("no json")),
    } as unknown as Response);

    const result = await client.delete("/containers/v1beta1/regions/{region}/containers/abc");
    expect(result).toEqual({});
  });

  it("throws ScalewayApiError on 4xx", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "Container not found", type: "not_found" }, 404),
    );

    await expect(
      client.get("/containers/v1beta1/regions/{region}/containers/bad"),
    ).rejects.toThrow(ScalewayApiError);

    try {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ message: "Container not found", type: "not_found" }, 404),
      );
      await client.get("/containers/v1beta1/regions/{region}/containers/bad");
    } catch (err) {
      expect(err).toBeInstanceOf(ScalewayApiError);
      expect((err as ScalewayApiError).statusCode).toBe(404);
      expect((err as ScalewayApiError).message).toBe(
        "[GET /containers/v1beta1/regions/{region}/containers/bad] Container not found",
      );
    }
  });

  it("includes invalid_arguments details in the error message", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          message: "invalid argument(s)",
          type: "invalid_arguments",
          details: [
            {
              argument_name: "registry_image",
              reason: "format",
              help_message: "must be a valid container registry URL",
            },
          ],
        },
        400,
      ),
    );

    await expect(
      client.post("/containers/v1beta1/regions/{region}/containers", {}),
    ).rejects.toMatchObject({
      message: expect.stringContaining("registry_image"),
    });

    try {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            message: "invalid argument(s)",
            type: "invalid_arguments",
            details: [
              {
                argument_name: "registry_image",
                reason: "format",
                help_message: "must be a valid container registry URL",
              },
            ],
          },
          400,
        ),
      );
      await client.post("/containers/v1beta1/regions/{region}/containers", {});
    } catch (err) {
      expect((err as ScalewayApiError).message).toContain("registry_image");
      expect((err as ScalewayApiError).message).toContain("must be a valid container registry URL");
    }
  });

  it("formatScalewayErrorMessage surfaces field maps from instance-style errors", () => {
    const msg = formatScalewayErrorMessage(
      {
        message: "Bad request",
        fields: { name: ["already exists"] },
      },
      400,
    );
    expect(msg).toContain("name:");
    expect(msg).toContain("already exists");
  });

  it("retries on 5xx errors", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: "Internal error" }, 500))
      .mockResolvedValueOnce(jsonResponse({ id: "recovered" }));

    const result = await client.get<{ id: string }>(
      "/containers/v1beta1/regions/{region}/containers/abc",
    );

    expect(result.id).toBe("recovered");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 rate limit", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: "Rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse({ id: "ok" }));

    const result = await client.get<{ id: string }>(
      "/containers/v1beta1/regions/{region}/containers/abc",
    );

    expect(result.id).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("isTransientResourceError matches Scaleway transient message and 409", () => {
    const transientMsg = new ScalewayApiError(
      "[POST /x] resource is in a transient state — resource: container (id)",
      400,
      {},
      { method: "POST", path: "/x" },
    );
    expect(isTransientResourceError(transientMsg)).toBe(true);

    const conflict = new ScalewayApiError("[POST /x] conflict", 409, {}, {
      method: "POST",
      path: "/x",
    });
    expect(isTransientResourceError(conflict)).toBe(true);

    expect(isTransientResourceError(new Error("other"))).toBe(false);
    const notFound = new ScalewayApiError("missing", 404, {}, undefined);
    expect(isTransientResourceError(notFound)).toBe(false);
  });

  it("postContainerDeploy retries on transient state then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const deployPath =
        "/containers/v1beta1/regions/{region}/containers/c1/deploy";
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse(
            {
              message: "resource is in a transient state",
              type: "transient_state",
              resource: "container",
              resource_id: "c1",
            },
            400,
          ),
        )
        .mockResolvedValueOnce(jsonResponse({}, 200));

      const done = postContainerDeploy(client, deployPath, {});
      await vi.advanceTimersByTimeAsync(3_000);
      await done;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws after exhausting all retries on repeated 5xx", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: "Server error" }, 500))
      .mockResolvedValueOnce(jsonResponse({ message: "Server error" }, 500))
      .mockResolvedValueOnce(jsonResponse({ message: "Server error" }, 500));

    await expect(
      client.get("/containers/v1beta1/regions/{region}/containers/abc"),
    ).rejects.toBeInstanceOf(ScalewayApiError);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on network error (fetch throws) then succeeds", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse({ id: "recovered" }));

    const result = await client.get<{ id: string }>(
      "/containers/v1beta1/regions/{region}/containers/abc",
    );

    expect(result.id).toBe("recovered");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all retries on repeated network errors", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      client.get("/containers/v1beta1/regions/{region}/containers/abc"),
    ).rejects.toThrow("Failed to fetch");

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 403 Forbidden", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "Forbidden", type: "permissions_denied" }, 403),
    );

    await expect(
      client.get("/containers/v1beta1/regions/{region}/containers/abc"),
    ).rejects.toBeInstanceOf(ScalewayApiError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404 Not Found", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "Not found" }, 404),
    );

    await expect(
      client.get("/containers/v1beta1/regions/{region}/containers/bad"),
    ).rejects.toBeInstanceOf(ScalewayApiError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("formatScalewayErrorMessage includes raw body when invalid_arguments has empty details", () => {
    const data = {
      message: "invalid argument(s)",
      type: "invalid_arguments",
      details: [],
    };
    const msg = formatScalewayErrorMessage(data, 400);
    expect(msg).toContain("invalid argument(s)");
    expect(msg).toContain("raw:");
  });

  it("formatScalewayErrorMessage formats permissions_denied with action and resource", () => {
    const msg = formatScalewayErrorMessage(
      {
        message: "Insufficient permissions",
        type: "permissions_denied",
        details: [{ action: "write", resource: "containers" }],
      },
      403,
    );
    expect(msg).toContain("write");
    expect(msg).toContain("containers");
  });

  it("formatScalewayErrorMessage formats quotas_exceeded with resource and quota", () => {
    const msg = formatScalewayErrorMessage(
      {
        message: "Quota exceeded",
        type: "quotas_exceeded",
        details: [{ resource: "containers", current: 10, quota: 10 }],
      },
      429,
    );
    expect(msg).toContain("containers");
    expect(msg).toContain("10/10");
  });
});
