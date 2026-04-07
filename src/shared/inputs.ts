import * as core from "@actions/core";

export function getOptionalIntInput(name: string): number | undefined {
  const v = core.getInput(name);
  return v ? parseInt(v, 10) : undefined;
}

export function getOptionalStringInput(name: string): string | undefined {
  const v = core.getInput(name);
  return v || undefined;
}

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
