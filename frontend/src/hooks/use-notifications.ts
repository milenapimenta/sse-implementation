import { useCallback, useMemo, useState } from "react";
import {
  listNotifications,
  markNotificationAsRead
} from "../api/notifications-api";
import type { Notification, NotificationFilter } from "../types/notification";
import {
  mergeNotificationsById,
  upsertNotification
} from "../utils/notification-id";

export interface UseNotificationsResult {
  notifications: Notification[];
  visibleNotifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  filter: NotificationFilter;
  setFilter: (filter: NotificationFilter) => void;
  loadNotifications: (userId: string) => Promise<void>;
  addNotification: (notification: Notification) => void;
  markAsRead: (userId: string, notificationId: string) => Promise<void>;
  reset: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleNotifications = useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((notification) => notification.readAt === null);
    }

    return notifications;
  }, [filter, notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.readAt === null).length,
    [notifications]
  );

  const loadNotifications = useCallback(async (userId: string) => {
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      setError("Informe um usuario para carregar as notificacoes.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loaded = await listNotifications({
        userId: normalizedUserId,
        unreadOnly: false,
        limit: 50
      });

      setNotifications((current) => mergeNotificationsById(current, loaded));
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar notificacoes.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const addNotification = useCallback((notification: Notification) => {
    setNotifications((current) => upsertNotification(current, notification));
  }, []);

  const markAsRead = useCallback(async (userId: string, notificationId: string) => {
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      setError("Informe um usuario para marcar notificacoes como lidas.");
      return;
    }

    setError(null);

    try {
      const updated = await markNotificationAsRead({
        userId: normalizedUserId,
        notificationId
      });

      setNotifications((current) => upsertNotification(current, updated));
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Falha ao marcar notificacao como lida.";
      setError(message);
      throw requestError;
    }
  }, []);

  const reset = useCallback(() => {
    setNotifications([]);
    setFilter("all");
    setError(null);
    setLoading(false);
  }, []);

  return {
    notifications,
    visibleNotifications,
    unreadCount,
    loading,
    error,
    filter,
    setFilter,
    loadNotifications,
    addNotification,
    markAsRead,
    reset
  };
}
