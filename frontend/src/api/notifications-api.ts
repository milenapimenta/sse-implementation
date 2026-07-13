import type {
  CreateNotificationPayload,
  ListNotificationsResponse,
  Notification
} from "../types/notification";
import { request } from "./http-client";

export async function listNotifications(options: {
  userId: string;
  unreadOnly: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 20),
    unreadOnly: String(options.unreadOnly)
  });

  const response = await request<ListNotificationsResponse>(
    `/api/notifications?${params.toString()}`,
    {
      headers: {
        "X-User-Id": options.userId
      }
    }
  );

  return response.data;
}

export async function createNotification(
  payload: CreateNotificationPayload
): Promise<Notification> {
  return request<Notification>("/api/notifications", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function markNotificationAsRead(options: {
  userId: string;
  notificationId: string;
}): Promise<Notification> {
  return request<Notification>(`/api/notifications/${options.notificationId}/read`, {
    method: "PATCH",
    headers: {
      "X-User-Id": options.userId
    }
  });
}
