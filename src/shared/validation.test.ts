import { describe, it, expect } from "vitest";
import { validateRegion } from "./validation";

describe("validateRegion", () => {
  it("returns 'fr-par' unchanged", () => {
    expect(validateRegion("fr-par")).toBe("fr-par");
  });

  it("returns 'nl-ams' unchanged", () => {
    expect(validateRegion("nl-ams")).toBe("nl-ams");
  });

  it("returns 'pl-waw' unchanged", () => {
    expect(validateRegion("pl-waw")).toBe("pl-waw");
  });

  it("throws for an empty string and mentions valid regions", () => {
    expect(() => validateRegion("")).toThrow(/fr-par.*nl-ams.*pl-waw/);
  });

  it("throws for an unknown region and includes the bad value in the message", () => {
    expect(() => validateRegion("us-east-1")).toThrow(/us-east-1/);
  });
});
