import { describe, expect, it } from "vitest";
import { NOTIFICATIONS_CHANNEL } from "../redis/redis";
import type { NotificationRepository } from "../modules/notifications/notification.repository";
import { NotificationService } from "../modules/notifications/notification.service";
import type {
  CreateNotificationInput,
  Notification,
  NotificationPublisher
} from "../modules/notifications/notification.types";
import { createTestLogger } from "./test-logger";

describe("NotificationService", () => {
  it("persists and publishes notification events to Redis", async () => {
    const notification: Notification = {
      id: "1",
      userId: "user-123",
      type: "message",
      title: "Nova mensagem",
      message: "Voce recebeu uma nova mensagem.",
      data: null,
      readAt: null,
      createdAt: "2026-01-01T12:00:00.000Z"
    };
    const createdInputs: CreateNotificationInput[] = [];
    const published: Array<{ channel: string; message: string }> = [];

    const repository = {
      create: async (input: CreateNotificationInput) => {
        createdInputs.push(input);
        return notification;
      }
    } as unknown as NotificationRepository;

    const publisher: NotificationPublisher = {
      publish: async (channel, message) => {
        published.push({ channel, message });
        return 1;
      }
    };

    const service = new NotificationService(
      repository,
      publisher,
      createTestLogger()
    );

    await service.create({
      userId: "user-123",
      type: "message",
      title: "Nova mensagem",
      message: "Voce recebeu uma nova mensagem."
    });

    expect(createdInputs).toHaveLength(1);
    expect(published).toHaveLength(1);
    expect(published[0].channel).toBe(NOTIFICATIONS_CHANNEL);
    expect(JSON.parse(published[0].message)).toEqual({
      event: "notification.created",
      notification
    });
  });
});
