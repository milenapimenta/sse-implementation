import { describe, expect, it } from "vitest";
import type { Notification } from "../types/notification";
import {
  mergeNotificationsById,
  upsertNotification
} from "./notification-id";

function notification(
  id: string,
  createdAt: string,
  readAt: string | null = null
): Notification {
  return {
    id,
    userId: "user-123",
    type: "message",
    title: `Titulo ${id}`,
    message: `Mensagem ${id}`,
    data: null,
    readAt,
    createdAt
  };
}

describe("notification merge", () => {
  it("deduplicates notifications by id", () => {
    const merged = mergeNotificationsById(
      [notification("1", "2026-01-01T10:00:00.000Z")],
      [notification("1", "2026-01-01T10:00:00.000Z", "2026-01-01T10:01:00.000Z")]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].readAt).toBe("2026-01-01T10:01:00.000Z");
  });

  it("orders newest notifications first", () => {
    const merged = mergeNotificationsById(
      [notification("1", "2026-01-01T10:00:00.000Z")],
      [notification("2", "2026-01-01T11:00:00.000Z")]
    );

    expect(merged.map((item) => item.id)).toEqual(["2", "1"]);
  });

  it("compares big numeric ids without converting to Number", () => {
    const merged = mergeNotificationsById(
      [notification("9007199254740993", "2026-01-01T10:00:00.000Z")],
      [notification("9007199254740994", "2026-01-01T10:00:00.000Z")]
    );

    expect(merged.map((item) => item.id)).toEqual([
      "9007199254740994",
      "9007199254740993"
    ]);
  });

  it("upserts a notification", () => {
    const updated = upsertNotification(
      [notification("1", "2026-01-01T10:00:00.000Z")],
      notification("1", "2026-01-01T10:00:00.000Z", "2026-01-01T10:02:00.000Z")
    );

    expect(updated[0].readAt).toBe("2026-01-01T10:02:00.000Z");
  });
});
