import type { ScalewayRegion } from "./types";

const VALID_REGIONS: ScalewayRegion[] = ["fr-par", "nl-ams", "pl-waw"];

/**
 * Validate and narrow a raw string to a `ScalewayRegion`.
 *
 * Throws a descriptive error when the value is not one of the supported
 * regions (`fr-par`, `nl-ams`, `pl-waw`), so callers fail fast with a
 * useful message rather than a cryptic API error deep in the call stack.
 */
export function validateRegion(value: string): ScalewayRegion {
  if (!VALID_REGIONS.includes(value as ScalewayRegion)) {
    throw new Error(
      `Invalid region "${value}". Must be one of: ${VALID_REGIONS.join(", ")}`,
    );
  }
  return value as ScalewayRegion;
}
