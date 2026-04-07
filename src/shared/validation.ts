import type { ScalewayRegion } from "./types";

const VALID_REGIONS: ScalewayRegion[] = ["fr-par", "nl-ams", "pl-waw"];

export function validateRegion(value: string): ScalewayRegion {
  if (!VALID_REGIONS.includes(value as ScalewayRegion)) {
    throw new Error(
      `Invalid region "${value}". Must be one of: ${VALID_REGIONS.join(", ")}`,
    );
  }
  return value as ScalewayRegion;
}
