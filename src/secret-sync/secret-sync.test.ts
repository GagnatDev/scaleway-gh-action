import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

describe("secret-sync (placeholder)", () => {
  it("imports run without side effects", async () => {
    // This will fail until run() is exported from the action module.
    const mod = await import("./index");
    expect(typeof mod.run).toBe("function");
  });
});
