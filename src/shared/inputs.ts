/**
 * Helpers for reading optional GitHub Actions inputs.
 *
 * Each function returns `undefined` when the input is absent or empty so
 * callers can do a simple `if (value !== undefined)` guard before including
 * the field in a request body.
 */
import * as core from "@actions/core";

/** Returns the input parsed as an integer, or `undefined` if the input is empty. */
export function getOptionalIntInput(name: string): number | undefined {
  const v = core.getInput(name);
  return v ? parseInt(v, 10) : undefined;
}

/** Returns the input string, or `undefined` if the input is empty. */
export function getOptionalStringInput(name: string): string | undefined {
  const v = core.getInput(name);
  return v || undefined;
}

/**
 * Returns the input parsed as JSON, or `undefined` if the input is empty.
 * Logs a `core.warning` and returns `undefined` when the input is non-empty
 * but not valid JSON.
 */
export function getOptionalJsonInput(name: string): unknown | undefined {
  const v = core.getInput(name);
  if (!v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    core.warning(`Failed to parse ${name} as JSON, skipping`);
    return undefined;
  }
}
