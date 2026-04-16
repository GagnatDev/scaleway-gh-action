import { describe, it, expect } from "vitest";
import { parseSecretEnvVars } from "./parse-secret-env-vars";

describe("parseSecretEnvVars", () => {
  it("parses a multi-line YAML mapping into SecretEnvVar[]", () => {
    const raw = "DB_PASS: s3cr3t\nDB_HOST: localhost:9000";

    expect(parseSecretEnvVars(raw)).toEqual([
      { key: "DB_PASS", value: "s3cr3t" },
      { key: "DB_HOST", value: "localhost:9000" },
    ]);
  });

  it("parses a single key-value pair", () => {
    expect(parseSecretEnvVars("API_KEY: abc123")).toEqual([
      { key: "API_KEY", value: "abc123" },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseSecretEnvVars("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(parseSecretEnvVars("   \n  \n  ")).toEqual([]);
  });

  it("coerces numeric values to strings", () => {
    const raw = "PORT: 5432\nREPLICAS: 3";

    expect(parseSecretEnvVars(raw)).toEqual([
      { key: "PORT", value: "5432" },
      { key: "REPLICAS", value: "3" },
    ]);
  });

  it("coerces boolean values to strings", () => {
    expect(parseSecretEnvVars("DEBUG: true")).toEqual([
      { key: "DEBUG", value: "true" },
    ]);
  });

  it("handles values containing colons", () => {
    expect(parseSecretEnvVars("DSN: postgres://user:pass@host:5432/db")).toEqual(
      [{ key: "DSN", value: "postgres://user:pass@host:5432/db" }],
    );
  });

  it("handles values containing special characters", () => {
    const raw = 'TOKEN: "abc#def{ghi}"';

    expect(parseSecretEnvVars(raw)).toEqual([
      { key: "TOKEN", value: "abc#def{ghi}" },
    ]);
  });

  it("handles values with double quotes inside", () => {
    const raw = `PASSWORD: 'he said "hello"'`;

    expect(parseSecretEnvVars(raw)).toEqual([
      { key: "PASSWORD", value: 'he said "hello"' },
    ]);
  });

  it("handles values with backslashes", () => {
    const raw = 'PATH: "C:\\\\Users\\\\app"';

    expect(parseSecretEnvVars(raw)).toEqual([
      { key: "PATH", value: "C:\\Users\\app" },
    ]);
  });

  it("throws for an array input", () => {
    expect(() => parseSecretEnvVars("- one\n- two")).toThrow(
      /must be a YAML key: value mapping.*got array/,
    );
  });

  it("throws for a scalar input", () => {
    expect(() => parseSecretEnvVars("just a plain string")).toThrow(
      /must be a YAML key: value mapping.*got string/,
    );
  });

  it("strips trailing newline from block scalar input", () => {
    const raw = "KEY: value\n";

    expect(parseSecretEnvVars(raw)).toEqual([{ key: "KEY", value: "value" }]);
  });
});
