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
      project_id: "proj-123",
      secret_name: "MY_SECRET",
      secret_value: "super-secret",
      description: "",
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

describe("secret-sync", () => {
  it("creates a new version when the secret already exists", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ secrets: [{ id: "s-1" }], total_count: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: "v-1", revision: 3 }));

    const { run } = await import("./index");
    await run();

    expect(core.setOutput).toHaveBeenCalledWith("secret_id", "s-1");
    expect(core.setOutput).toHaveBeenCalledWith("version_number", "3");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("creates the secret then adds a version when no secret exists", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ secrets: [], total_count: 0 }))
      .mockResolvedValueOnce(jsonResponse({ id: "s-new", name: "MY_SECRET" }))
      .mockResolvedValueOnce(jsonResponse({ id: "v-1", revision: 1 }));

    const { run } = await import("./index");
    await run();

    expect(core.setOutput).toHaveBeenCalledWith("secret_id", "s-new");
    expect(core.setOutput).toHaveBeenCalledWith("version_number", "1");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("sends a PATCH to update description when secret exists and description is provided", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        secret_key: "test-secret-key",
        region: "fr-par",
        project_id: "proj-123",
        secret_name: "MY_SECRET",
        secret_value: "value",
        description: "my desc",
      };
      return inputs[name] ?? "";
    });

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ secrets: [{ id: "s-1" }], total_count: 1 }))
      .mockResolvedValueOnce(jsonResponse({})) // PATCH description
      .mockResolvedValueOnce(jsonResponse({ id: "v-1", revision: 2 }));

    const { run } = await import("./index");
    await run();

    // Second call should be the PATCH for description
    const [, patchOpts] = mockFetch.mock.calls[1];
    expect(patchOpts.method).toBe("PATCH");
    expect(JSON.parse(patchOpts.body)).toEqual({ description: "my desc" });
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("does not send PATCH when description is empty", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ secrets: [{ id: "s-1" }], total_count: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: "v-1", revision: 1 }));

    const { run } = await import("./index");
    await run();

    // Only 2 calls: GET list + POST version (no PATCH)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("calls setFailed when the list API returns an error", async () => {
    // 404 is non-retriable so a single mock response is enough
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "Project not found" }, 404),
    );

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Project not found"),
    );
  });

  it("calls setFailed when the version create API returns an error", async () => {
    // 400 is non-retriable
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ secrets: [{ id: "s-1" }], total_count: 1 }))
      .mockResolvedValueOnce(jsonResponse({ message: "Invalid data" }, 400));

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid data"),
    );
  });

  it("calls setFailed for an invalid region", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        secret_key: "test-secret-key",
        region: "ap-southeast-1",
        project_id: "proj-123",
        secret_name: "MY_SECRET",
        secret_value: "super-secret",
        description: "",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("ap-southeast-1"),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("base64-encodes the secret value in the version POST body", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ secrets: [{ id: "s-1" }], total_count: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: "v-1", revision: 1 }));

    const { run } = await import("./index");
    await run();

    const [, postOpts] = mockFetch.mock.calls[1];
    const body = JSON.parse(postOpts.body);
    expect(body.data).toBe(Buffer.from("super-secret").toString("base64"));
  });
});
