import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as core from "@actions/core";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setSecret: vi.fn(),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    const inputs: Record<string, string> = {
      secret_key: "test-secret-key",
      region: "fr-par",
      container_id: "c-123",
      registry_image_url: "rg.fr-par.scw.cloud/ns/image:latest",
      timeout_seconds: "300",
      min_scale: "",
      max_scale: "",
      memory_limit: "",
      cpu_limit: "",
      port: "",
      http_option: "",
      environment_variables: "",
      secret_environment_variables: "",
    };
    return inputs[name] ?? "";
  });
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

describe("container-deploy", () => {
  it("patches, deploys, and polls to ready state", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: "c-123" })) // PATCH
      .mockResolvedValueOnce(jsonResponse({})) // POST deploy
      .mockResolvedValueOnce(
        jsonResponse({ id: "c-123", status: "ready", domain_name: "c.scw.cloud" }),
      ); // GET poll

    const { run } = await import("./index");
    await run();

    expect(core.setOutput).toHaveBeenCalledWith("status", "ready");
    expect(core.setOutput).toHaveBeenCalledWith("endpoint_url", "https://c.scw.cloud");
    expect(core.setOutput).toHaveBeenCalledWith(
      "deploy_duration_seconds",
      expect.any(String),
    );
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("calls setFailed when PATCH fails and makes no further requests", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Not found" }, 404));

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Not found"),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries the deploy POST on transient state then succeeds", async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: "c-123" })) // PATCH
        .mockResolvedValueOnce(
          jsonResponse(
            { message: "resource is in a transient state", resource: "container", resource_id: "c-123" },
            400,
          ),
        ) // POST deploy attempt 1
        .mockResolvedValueOnce(jsonResponse({})) // POST deploy attempt 2
        .mockResolvedValueOnce(
          jsonResponse({ id: "c-123", status: "ready", domain_name: "c.scw.cloud" }),
        ); // GET poll

      const { run } = await import("./index");
      const done = run();
      await vi.advanceTimersByTimeAsync(5_000);
      await done;

      expect(core.setOutput).toHaveBeenCalledWith("status", "ready");
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls setFailed when poll reaches error status", async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: "c-123" })) // PATCH
        .mockResolvedValueOnce(jsonResponse({})) // POST deploy
        .mockResolvedValueOnce(
          jsonResponse({ id: "c-123", status: "error", error_message: "Image pull failed" }),
        ); // GET poll

      const { run } = await import("./index");
      const done = run();
      await vi.advanceTimersByTimeAsync(10_000);
      await done;

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("error"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("PATCH body contains only registry_image when no optional fields are provided", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: "c-123" }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ id: "c-123", status: "ready", domain_name: "c.scw.cloud" }),
      );

    const { run } = await import("./index");
    await run();

    const [, patchOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(patchOpts.body);
    expect(body).toEqual({ registry_image: "rg.fr-par.scw.cloud/ns/image:latest" });
  });

  it("PATCH body includes optional fields when provided", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        secret_key: "test-secret-key",
        region: "fr-par",
        container_id: "c-123",
        registry_image_url: "rg.fr-par.scw.cloud/ns/image:latest",
        timeout_seconds: "300",
        min_scale: "1",
        max_scale: "3",
        memory_limit: "512",
        cpu_limit: "280",
        port: "8080",
        http_option: "redirected",
        environment_variables: '{"KEY":"val"}',
        secret_environment_variables: "",
      };
      return inputs[name] ?? "";
    });

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: "c-123" }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({ id: "c-123", status: "ready", domain_name: "c.scw.cloud" }),
      );

    const { run } = await import("./index");
    await run();

    const [, patchOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(patchOpts.body);
    expect(body.min_scale).toBe(1);
    expect(body.max_scale).toBe(3);
    expect(body.memory_limit).toBe(512);
    expect(body.http_option).toBe("redirected");
    expect(body.environment_variables).toEqual({ KEY: "val" });
  });
});
