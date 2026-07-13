import type { AppLogger } from "../../utils/logger";
import type { NotificationRepository } from "./notification.repository";
import type { CreateNotificationInput, Notification, NotificationPublisher } from "./notification.types";
export declare class NotificationService {
    private readonly repository;
    private readonly publisher;
    private readonly logger;
    constructor(repository: NotificationRepository, publisher: NotificationPublisher, logger: AppLogger);
    create(input: CreateNotificationInput): Promise<Notification>;
    list(options: {
        userId: string;
        limit: number;
        cursor?: string;
        unreadOnly: boolean;
    }): Promise<Notification[]>;
    markAsRead(id: string, userId: string): Promise<Notification | null>;
}
