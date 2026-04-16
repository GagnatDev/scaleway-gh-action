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

  const parsed: unknown = parseYaml(trimmed);

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
