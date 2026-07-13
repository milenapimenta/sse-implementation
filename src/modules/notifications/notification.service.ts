import {
  NOTIFICATIONS_CHANNEL,
  type NotificationCreatedMessage
} from "../../redis/redis";
import type { AppLogger } from "../../utils/logger";
import type { NotificationRepository } from "./notification.repository";
import type {
  CreateNotificationInput,
  Notification,
  NotificationPublisher
} from "./notification.types";

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly publisher: NotificationPublisher,
    private readonly logger: AppLogger
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = await this.repository.create(input);
    const message: NotificationCreatedMessage = {
      event: "notification.created",
      notification
    };

    await this.publisher.publish(
      NOTIFICATIONS_CHANNEL,
      JSON.stringify(message)
    );

    this.logger.info(
      { notificationId: notification.id, userId: notification.userId },
      "notification event published to redis"
    );

    return notification;
  }

  async list(options: {
    userId: string;
    limit: number;
    cursor?: string;
    unreadOnly: boolean;
  }): Promise<Notification[]> {
    return this.repository.list(options);
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    return this.repository.markAsRead(id, userId);
  }
}
