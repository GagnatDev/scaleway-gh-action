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
      action: "attach",
      container_id: "c-123",
      hostname: "app.example.com",
      domain_id: "d-123",
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

describe("container-domain", () => {
  describe("attach", () => {
    it("creates domain mapping and polls until ready", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: "d-new" })) // POST domain
        .mockResolvedValueOnce(
          jsonResponse({ id: "d-new", status: "ready", url: "https://app.example.com" }),
        ); // GET poll

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("domain_id", "d-new");
      expect(core.setOutput).toHaveBeenCalledWith("url", "https://app.example.com");
      expect(core.setOutput).toHaveBeenCalledWith("status", "ready");
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("calls setFailed when poll reaches error status", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: "d-new" }))
        .mockResolvedValueOnce(
          jsonResponse({ id: "d-new", status: "error", error_message: "DNS timeout" }),
        );

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("error"),
      );
    });

    it("calls setFailed when POST domain fails", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Container not found" }, 404));

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Container not found"),
      );
    });

    it("polls multiple times before becoming ready", async () => {
      vi.useFakeTimers();
      try {
        mockFetch
          .mockResolvedValueOnce(jsonResponse({ id: "d-new" })) // POST
          .mockResolvedValueOnce(jsonResponse({ id: "d-new", status: "pending" })) // poll 1
          .mockResolvedValueOnce(
            jsonResponse({ id: "d-new", status: "ready", url: "https://app.example.com" }),
          ); // poll 2

        const { run } = await import("./index");
        const done = run();
        await vi.advanceTimersByTimeAsync(15_000);
        await done;

        expect(core.setOutput).toHaveBeenCalledWith("status", "ready");
        expect(mockFetch).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("detach", () => {
    it("deletes the domain mapping and sets outputs", async () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          secret_key: "test-secret-key",
          region: "fr-par",
          action: "detach",
          container_id: "c-123",
          hostname: "",
          domain_id: "d-123",
        };
        return inputs[name] ?? "";
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error("no json")),
      } as unknown as Response);

      const { run } = await import("./index");
      await run();

      expect(core.setOutput).toHaveBeenCalledWith("domain_id", "d-123");
      expect(core.setOutput).toHaveBeenCalledWith("status", "deleted");
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("calls setFailed when DELETE fails", async () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          secret_key: "test-secret-key",
          region: "fr-par",
          action: "detach",
          container_id: "c-123",
          hostname: "",
          domain_id: "d-123",
        };
        return inputs[name] ?? "";
      });

      mockFetch.mockResolvedValueOnce(jsonResponse({ message: "Domain not found" }, 404));

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("Domain not found"),
      );
    });
  });

  describe("invalid region", () => {
    it("calls setFailed before making any API call", async () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        return name === "region" ? "bad-region" : (name === "secret_key" ? "key" : "attach");
      });

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("bad-region"),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("unknown action", () => {
    it("calls setFailed with a helpful message", async () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          secret_key: "test-secret-key",
          region: "fr-par",
          action: "bind",
        };
        return inputs[name] ?? "";
      });

      const { run } = await import("./index");
      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("bind"),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
