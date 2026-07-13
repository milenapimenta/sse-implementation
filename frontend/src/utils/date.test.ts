import { describe, expect, it } from "vitest";
import { formatDateTime } from "./date";

describe("formatDateTime", () => {
  it("formats valid dates", () => {
    expect(formatDateTime("2026-01-01T12:00:00.000Z")).toContain("2026");
  });

  it("handles missing and invalid dates", () => {
    expect(formatDateTime(null)).toBe("Nao informado");
    expect(formatDateTime("not-a-date")).toBe("Data invalida");
  });
});
