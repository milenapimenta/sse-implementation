import type { Pool } from "pg";
import type { CreateNotificationInput, ListNotificationsInput, Notification } from "./notification.types";
export declare class NotificationRepository {
    private readonly pool;
    constructor(pool: Pool);
    create(input: CreateNotificationInput): Promise<Notification>;
    list(input: ListNotificationsInput): Promise<Notification[]>;
    markAsRead(id: string, userId: string): Promise<Notification | null>;
    findAfterIdForUser(userId: string, lastEventId: string, limit?: number): Promise<Notification[]>;
    countByUser(userId: string): Promise<number>;
}
