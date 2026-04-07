import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as core from "@actions/core";
import * as exec from "@actions/exec";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  getBooleanInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setSecret: vi.fn(),
  saveState: vi.fn(),
  getState: vi.fn(),
}));

vi.mock("@actions/exec", () => ({
  getExecOutput: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(core.getInput).mockImplementation((name: string) => {
    const inputs: Record<string, string> = {
      secret_key: "test-secret-key",
      region: "fr-par",
      registry_namespace: "my-namespace",
    };
    return inputs[name] ?? "";
  });
  vi.mocked(core.getBooleanInput).mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registry-login", () => {
  it("runs docker login and sets registry output on success", async () => {
    vi.mocked(exec.getExecOutput).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "Login Succeeded",
      stderr: "",
    });

    const { run } = await import("./index");
    await run();

    expect(exec.getExecOutput).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["login", "rg.fr-par.scw.cloud/my-namespace"]),
      expect.any(Object),
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "registry",
      "rg.fr-par.scw.cloud/my-namespace",
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("saves registry and logout state", async () => {
    vi.mocked(exec.getExecOutput).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    const { run } = await import("./index");
    await run();

    expect(core.saveState).toHaveBeenCalledWith(
      "registry",
      "rg.fr-par.scw.cloud/my-namespace",
    );
    expect(core.saveState).toHaveBeenCalledWith("logout", "true");
  });

  it("calls setFailed when docker login exits with non-zero code", async () => {
    vi.mocked(exec.getExecOutput).mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "unauthorized: incorrect username or password",
    });

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/exit code 1.*unauthorized/),
    );
  });
});

describe("registry-login post", () => {
  it("runs docker logout when logout state is true and registry is set", async () => {
    vi.mocked(core.getState).mockImplementation((name: string) => {
      const state: Record<string, string> = {
        registry: "rg.fr-par.scw.cloud/my-namespace",
        logout: "true",
      };
      return state[name] ?? "";
    });

    vi.mocked(exec.getExecOutput).mockResolvedValueOnce({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    const { post } = await import("./post");
    await post();

    expect(exec.getExecOutput).toHaveBeenCalledWith(
      "docker",
      ["logout", "rg.fr-par.scw.cloud/my-namespace"],
      expect.any(Object),
    );
  });

  it("does not run docker logout when logout state is false", async () => {
    vi.mocked(core.getState).mockImplementation((name: string) => {
      const state: Record<string, string> = {
        registry: "rg.fr-par.scw.cloud/my-namespace",
        logout: "false",
      };
      return state[name] ?? "";
    });

    const { post } = await import("./post");
    await post();

    expect(exec.getExecOutput).not.toHaveBeenCalled();
  });

  it("does not run docker logout when registry state is empty", async () => {
    vi.mocked(core.getState).mockImplementation((name: string) => {
      const state: Record<string, string> = {
        registry: "",
        logout: "true",
      };
      return state[name] ?? "";
    });

    const { post } = await import("./post");
    await post();

    expect(exec.getExecOutput).not.toHaveBeenCalled();
  });
});
