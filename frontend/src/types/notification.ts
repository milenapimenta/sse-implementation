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

export interface CreateNotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
}

export interface ListNotificationsResponse {
  data: Notification[];
}

export type NotificationFilter = "all" | "unread";
