import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as core from "@actions/core";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(core.getInput).mockReturnValue("");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getOptionalIntInput", () => {
  it("returns the parsed integer when input has a value", async () => {
    vi.mocked(core.getInput).mockReturnValue("42");
    const { getOptionalIntInput } = await import("./inputs");
    expect(getOptionalIntInput("my_field")).toBe(42);
  });

  it("returns undefined when input is empty", async () => {
    vi.mocked(core.getInput).mockReturnValue("");
    const { getOptionalIntInput } = await import("./inputs");
    expect(getOptionalIntInput("my_field")).toBeUndefined();
  });
});

describe("getOptionalStringInput", () => {
  it("returns the string when input has a value", async () => {
    vi.mocked(core.getInput).mockReturnValue("hello");
    const { getOptionalStringInput } = await import("./inputs");
    expect(getOptionalStringInput("my_field")).toBe("hello");
  });

  it("returns undefined when input is empty", async () => {
    vi.mocked(core.getInput).mockReturnValue("");
    const { getOptionalStringInput } = await import("./inputs");
    expect(getOptionalStringInput("my_field")).toBeUndefined();
  });
});

describe("getOptionalJsonInput", () => {
  it("returns the parsed object when input is valid JSON", async () => {
    vi.mocked(core.getInput).mockReturnValue('{"KEY":"val"}');
    const { getOptionalJsonInput } = await import("./inputs");
    expect(getOptionalJsonInput("env_vars")).toEqual({ KEY: "val" });
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("returns undefined and logs a warning when input is invalid JSON", async () => {
    vi.mocked(core.getInput).mockReturnValue("not-json");
    const { getOptionalJsonInput } = await import("./inputs");
    expect(getOptionalJsonInput("env_vars")).toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("env_vars"),
    );
  });

  it("returns undefined and does not warn when input is empty", async () => {
    vi.mocked(core.getInput).mockReturnValue("");
    const { getOptionalJsonInput } = await import("./inputs");
    expect(getOptionalJsonInput("env_vars")).toBeUndefined();
    expect(core.warning).not.toHaveBeenCalled();
  });
});
