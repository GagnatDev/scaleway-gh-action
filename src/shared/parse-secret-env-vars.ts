import { parse as parseYaml } from "yaml";
import type { SecretEnvVar } from "./types";

/**
 * Parses a YAML mapping string into the `SecretEnvVar[]` format expected by the
 * Scaleway Serverless Containers API.
 *
 * Expected input (received as a multi-line string from a GitHub Actions `|` block scalar):
 *
 *   DB_PASS: s3cr3t
 *   DB_HOST: localhost:9000
 *
 * Returns `[]` when `raw` is empty/whitespace-only.
 * Throws if the YAML is malformed or not a plain key-value mapping.
 */
export function parseSecretEnvVars(raw: string): SecretEnvVar[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = parseYaml(trimmed);
  } catch (error) {
    const errorCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? ` (${(error as { code: string }).code})`
        : "";
    const linePos =
      error &&
      typeof error === "object" &&
      "linePos" in error &&
      Array.isArray((error as { linePos?: unknown }).linePos) &&
      (error as { linePos: Array<{ line?: unknown; col?: unknown }> }).linePos
        .length > 0
        ? (error as { linePos: Array<{ line?: unknown; col?: unknown }> }).linePos[0]
        : undefined;
    const location =
      linePos &&
      typeof linePos.line === "number" &&
      typeof linePos.col === "number"
        ? ` at line ${linePos.line}, column ${linePos.col}`
        : "";
    throw new Error(
      `Failed to parse secret_environment_variables as YAML${errorCode}. ` +
        `Provide a valid key: value mapping${location}.`,
    );
  }

  if (parsed === null || parsed === undefined) return [];

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "secret_environment_variables must be a YAML key: value mapping, " +
        `got ${Array.isArray(parsed) ? "array" : typeof parsed}`,
    );
  }

  return Object.entries(parsed as Record<string, unknown>).map(
    ([key, value]) => ({
      key,
      value: String(value),
    }),
  );
}
