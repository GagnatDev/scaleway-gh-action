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
      job_definition_id: "jd-123",
      wait: "false",
      timeout_seconds: "600",
      command: "",
      memory_limit: "",
      cpu_limit: "",
      environment_variables: "",
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

describe("job-run", () => {
  it("starts a job and returns immediately when wait=false", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "jr-1", status: "running" }),
    );

    const { run } = await import("./index");
    await run();

    expect(core.setOutput).toHaveBeenCalledWith("job_run_id", "jr-1");
    expect(core.setOutput).toHaveBeenCalledWith("status", "running");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("polls until succeeded when wait=true", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        secret_key: "test-secret-key",
        region: "fr-par",
        job_definition_id: "jd-123",
        wait: "true",
        timeout_seconds: "30",
        command: "",
        memory_limit: "",
        cpu_limit: "",
        environment_variables: "",
      };
      return inputs[name] ?? "";
    });

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: "jr-1", status: "running" }))
      .mockResolvedValueOnce(jsonResponse({ id: "jr-1", status: "running" }))
      .mockResolvedValueOnce(jsonResponse({ id: "jr-1", status: "succeeded" }));

    vi.useFakeTimers();
    try {
      const { run } = await import("./index");
      const done = run();
      // Advance past two 5s polling intervals
      await vi.advanceTimersByTimeAsync(15_000);
      await done;
    } finally {
      vi.useRealTimers();
    }

    expect(core.setOutput).toHaveBeenCalledWith("job_run_id", "jr-1");
    expect(core.setOutput).toHaveBeenCalledWith("status", "succeeded");
    expect(core.setFailed).not.toHaveBeenCalled();
    // 1 POST start + 2 GET polls (running → succeeded)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("calls setFailed when job ends with failed status", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        secret_key: "test-secret-key",
        region: "fr-par",
        job_definition_id: "jd-123",
        wait: "true",
        timeout_seconds: "30",
        command: "",
        memory_limit: "",
        cpu_limit: "",
        environment_variables: "",
      };
      return inputs[name] ?? "";
    });

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: "jr-1", status: "running" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "jr-1", status: "failed", error_message: "OOM killed" }),
      );

    vi.useFakeTimers();
    try {
      const { run } = await import("./index");
      const done = run();
      await vi.advanceTimersByTimeAsync(10_000);
      await done;
    } finally {
      vi.useRealTimers();
    }

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringMatching(/failed.*OOM killed/),
    );
  });

  it("includes optional overrides in the POST body", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        secret_key: "test-secret-key",
        region: "fr-par",
        job_definition_id: "jd-123",
        wait: "false",
        timeout_seconds: "600",
        command: "python run.py",
        memory_limit: "2048",
        cpu_limit: "1000",
        environment_variables: '{"FOO":"bar"}',
      };
      return inputs[name] ?? "";
    });

    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "jr-1", status: "running" }));

    const { run } = await import("./index");
    await run();

    const [, postOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(postOpts.body);
    expect(body.command).toBe("python run.py");
    expect(body.memory_limit).toBe(2048);
    expect(body.cpu_limit).toBe(1000);
    expect(body.environment_variables).toEqual({ FOO: "bar" });
  });

  it("calls setFailed for an invalid region", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        secret_key: "test-secret-key",
        region: "eu-west-1",
        job_definition_id: "jd-123",
        wait: "false",
        timeout_seconds: "600",
      };
      return inputs[name] ?? "";
    });

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("eu-west-1"),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls setFailed when the start API returns an error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: "job definition not found" }, 404),
    );

    const { run } = await import("./index");
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("job definition not found"),
    );
  });
});
