export interface Notification {
    id: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, unknown> | null;
    readAt: string | null;
    createdAt: string;
}
export interface CreateNotificationInput {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown> | null;
}
export interface ListNotificationsInput {
    userId: string;
    limit: number;
    cursor?: string;
    unreadOnly: boolean;
}
export interface NotificationPublisher {
    publish(channel: string, message: string): Promise<number>;
}
