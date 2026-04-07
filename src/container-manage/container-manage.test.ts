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

function setupInputs(overrides: Record<string, string> = {}): void {
  const defaults: Record<string, string> = {
    secret_key: "test-secret-key",
    region: "fr-par",
    action: "create",
    namespace_id: "ns-123",
    container_id: "c-123",
    container_name: "my-container",
    registry_image: "rg.fr-par.scw.cloud/ns/image:latest",
    min_scale: "",
    max_scale: "",
    memory_limit: "",
    cpu_limit: "",
    port: "",
    privacy: "",
    protocol: "",
    http_option: "",
    description: "",
    environment_variables: "",
    secret_environment_variables: "",
    deploy: "true",
    wait: "true",
    timeout_seconds: "300",
  };
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    return { ...defaults, ...overrides }[name] ?? "";
  });
}

describe("container-manage", () => {
  describe("create", () => {
    it("creates, deploys, and waits when deploy=true and wait=true", async () => {
      setupInputs({ action: "create" });
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ id: "c-new", status: "created", domain_name: "" }),
        ) // POST create
        .mockResolvedValueOnce(jsonResponse({})) // POST deploy
        .mockResolvedValueOnce(
          jsonResponse({ id: "c-new", status: "ready", domain_name: "c.scw.cloud" }),
        ); // GET poll

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("container_id", "c-new");
      expect(core.setOutput).toHaveBeenCalledWith("status", "ready");
      expect(core.setOutput).toHaveBeenCalledWith("endpoint_url", "https://c.scw.cloud");
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("creates and deploys without waiting when wait=false", async () => {
      setupInputs({ action: "create", wait: "false" });
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: "c-new", status: "created", domain_name: "" }))
        .mockResolvedValueOnce(jsonResponse({})); // POST deploy

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("container_id", "c-new");
      // No poll — only 2 fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("creates without deploying when deploy=false", async () => {
      setupInputs({ action: "create", deploy: "false" });
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ id: "c-new", status: "created", domain_name: "c.scw.cloud" }),
      );

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("container_id", "c-new");
      expect(core.setOutput).toHaveBeenCalledWith("status", "created");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("calls setFailed when POST fails", async () => {
      setupInputs({ action: "create" });
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Namespace not found" }, 404));

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Namespace not found"),
      );
    });
  });

  describe("update", () => {
    it("patches, deploys, and waits when deploy=true and wait=true", async () => {
      setupInputs({ action: "update" });
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: "c-123" })) // PATCH
        .mockResolvedValueOnce(jsonResponse({})) // POST deploy
        .mockResolvedValueOnce(
          jsonResponse({ id: "c-123", status: "ready", domain_name: "c.scw.cloud" }),
        ); // GET poll

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("container_id", "c-123");
      expect(core.setOutput).toHaveBeenCalledWith("status", "ready");
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("patches without deploying when deploy=false", async () => {
      setupInputs({ action: "update", deploy: "false" });
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "c-123" }));

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("container_id", "c-123");
      expect(core.setOutput).toHaveBeenCalledWith("status", "updated");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("calls setFailed when PATCH fails", async () => {
      setupInputs({ action: "update" });
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Container not found" }, 404));

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Container not found"),
      );
    });
  });

  describe("delete", () => {
    it("deletes the container and sets outputs", async () => {
      setupInputs({ action: "delete" });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error("no json")),
      } as unknown as Response);

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("container_id", "c-123");
      expect(core.setOutput).toHaveBeenCalledWith("status", "deleted");
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("calls setFailed when DELETE fails", async () => {
      setupInputs({ action: "delete" });
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Container not found" }, 404));

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Container not found"),
      );
    });
  });

  describe("invalid region", () => {
    it("calls setFailed before making any API call", async () => {
      setupInputs({ action: "create", region: "us-east-1" });

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("us-east-1"),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("unknown action", () => {
    it("calls setFailed with a helpful message", async () => {
      setupInputs({ action: "restart" });

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("restart"),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
