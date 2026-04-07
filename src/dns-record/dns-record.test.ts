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
    dns_zone: "example.com",
    action: "add",
    record_name: "www",
    record_type: "A",
    record_data: "1.2.3.4",
    ttl: "3600",
  };
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    return { ...defaults, ...overrides }[name] ?? "";
  });
}

describe("dns-record", () => {
  it("sends an add change with correct structure", async () => {
    setupInputs({ action: "add" });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ records: [{ id: "r-1" }, { id: "r-2" }] }),
    );

    const { run } = await import("./index");
    await run();

    const [, patchOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(patchOpts.body);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0].add.records[0]).toMatchObject({
      name: "www",
      type: "A",
      data: "1.2.3.4",
      ttl: 3600,
    });
    expect(core.setOutput).toHaveBeenCalledWith("records_changed", "2");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("sends a set change with id_fields", async () => {
    setupInputs({ action: "set" });
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [{ id: "r-1" }] }));

    const { run } = await import("./index");
    await run();

    const [, patchOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(patchOpts.body);
    expect(body.changes[0].set.id_fields).toEqual({ name: "www", type: "A" });
    expect(body.changes[0].set.records[0].data).toBe("1.2.3.4");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("sends a delete change without records", async () => {
    setupInputs({ action: "delete", record_data: "" });
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [] }));

    const { run } = await import("./index");
    await run();

    const [, patchOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(patchOpts.body);
    expect(body.changes[0].delete.id_fields).toEqual({ name: "www", type: "A" });
    expect(body.changes[0].add).toBeUndefined();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("sends a clear change", async () => {
    setupInputs({ action: "clear", record_data: "" });
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [] }));

    const { run } = await import("./index");
    await run();

    const [, patchOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(patchOpts.body);
    expect(body.changes[0].clear.id_fields).toEqual({ name: "www", type: "A" });
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("calls setFailed and skips fetch when add has no record_data", async () => {
    setupInputs({ action: "add", record_data: "" });

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("record_data is required for add action"),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls setFailed and skips fetch when set has no record_data", async () => {
    setupInputs({ action: "set", record_data: "" });

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("record_data is required for set action"),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls setFailed for an unknown action", async () => {
    setupInputs({ action: "upsert" });

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Unknown action"),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls setFailed when the API returns an error", async () => {
    setupInputs({ action: "add" });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "Zone not found" }, 404),
    );

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Zone not found"),
    );
  });

  it("outputs records_changed based on response records count", async () => {
    setupInputs({ action: "add" });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ records: [{ id: "r-1" }, { id: "r-2" }, { id: "r-3" }] }),
    );

    const { run } = await import("./index");
    await run();

    expect(core.setOutput).toHaveBeenCalledWith("records_changed", "3");
  });
});
