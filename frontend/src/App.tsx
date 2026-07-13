import { useCallback, useEffect, useMemo, useState } from "react";
import { getSystemSnapshot } from "./api/system-api";
import "./components/ConnectionPanel/ConnectionPanel.css";
import { ConnectionPanel } from "./components/ConnectionPanel/ConnectionPanel";
import { CreateNotificationForm } from "./components/CreateNotificationForm/CreateNotificationForm";
import { NotificationList } from "./components/NotificationList/NotificationList";
import { StreamEvents } from "./components/StreamEvents/StreamEvents";
import { SystemStatus } from "./components/SystemStatus/SystemStatus";
import { config } from "./config/env";
import { useNotificationStream } from "./hooks/use-notification-stream";
import { useNotifications } from "./hooks/use-notifications";
import type { Notification } from "./types/notification";
import type { StreamLog } from "./types/sse";
import type { SystemSnapshot } from "./types/system";

const activeStatuses = ["connecting", "connected", "reconnecting"];

export function App() {
  const [userId, setUserId] = useState("user-123");
  const [streamLogs, setStreamLogs] = useState<StreamLog[]>([]);
  const [systemSnapshot, setSystemSnapshot] = useState<SystemSnapshot | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const {
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
  } = useNotifications();

  const appendStreamLog = useCallback((event: StreamLog) => {
    setStreamLogs((current) => [event, ...current].slice(0, 50));
  }, []);

  const handleNotification = useCallback(
    (notification: Notification) => {
      addNotification(notification);

      if (
        "Notification" in window &&
        document.hidden &&
        window.Notification.permission === "granted"
      ) {
        new window.Notification(notification.title, {
          body: notification.message
        });
      }
    },
    [addNotification]
  );

  const stream = useNotificationStream({
    userId,
    onNotification: handleNotification,
    onStreamEvent: appendStreamLog
  });

  const streamConnected = useMemo(
    () => activeStatuses.includes(stream.status),
    [stream.status]
  );

  const refreshSystemStatus = useCallback(async () => {
    setSystemLoading(true);
    setSystemError(null);

    try {
      const snapshot = await getSystemSnapshot();
      setSystemSnapshot(snapshot);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Falha ao consultar status da API.";
      setSystemError(message);
    } finally {
      setSystemLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSystemStatus();
  }, [refreshSystemStatus]);

  const handleConnect = useCallback(() => {
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      setStatusMessage("Informe um usuario antes de conectar.");
      return;
    }

    setStatusMessage(null);
    stream.connect();
    void loadNotifications(normalizedUserId);
    void refreshSystemStatus();
  }, [loadNotifications, refreshSystemStatus, stream, userId]);

  const handleDisconnect = useCallback(() => {
    stream.disconnect();
    void refreshSystemStatus();
  }, [refreshSystemStatus, stream]);

  const handleUserIdChange = useCallback(
    (nextUserId: string) => {
      setUserId(nextUserId);
      reset();
      setStreamLogs([]);
      setStatusMessage(null);
    },
    [reset]
  );

  const handleRefreshNotifications = useCallback(() => {
    void loadNotifications(userId);
  }, [loadNotifications, userId]);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      setMarkingIds((current) => new Set(current).add(notificationId));

      try {
        await markAsRead(userId, notificationId);
      } finally {
        setMarkingIds((current) => {
          const next = new Set(current);
          next.delete(notificationId);
          return next;
        });
      }
    },
    [markAsRead, userId]
  );

  const requestBrowserNotifications = useCallback(async () => {
    if (!("Notification" in window)) {
      setStatusMessage("Este navegador nao suporta notificacoes nativas.");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setStatusMessage(
      permission === "granted"
        ? "Notificacoes do navegador ativadas."
        : "Permissao para notificacoes nao concedida."
    );
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Notificações SSE</h1>
          <p>
            Dashboard didatico para consumir uma API de notificacoes em tempo real
            com EventSource nativo, fetch e deduplicacao por ID.
          </p>
          <p className="api-url">API atual: {config.apiUrl}</p>
        </div>

        <button
          type="button"
          className="button-secondary"
          onClick={requestBrowserNotifications}
        >
          Ativar notificacoes do navegador
        </button>
      </header>

      <div className="sr-status" aria-live="polite">
        {statusMessage}
      </div>
      {statusMessage && <p className="info-message">{statusMessage}</p>}

      <div className="top-grid">
        <ConnectionPanel
          userId={userId}
          status={stream.status}
          lastHeartbeatAt={stream.lastHeartbeatAt}
          lastEventId={stream.lastEventId}
          unreadCount={unreadCount}
          onUserIdChange={handleUserIdChange}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />

        <CreateNotificationForm
          defaultUserId={userId}
          streamConnected={streamConnected}
          onCreatedWhileDisconnected={addNotification}
        />
      </div>

      <div className="content-grid">
        <NotificationList
          notifications={visibleNotifications}
          filter={filter}
          loading={loading}
          error={error}
          markingIds={markingIds}
          onFilterChange={setFilter}
          onRefresh={handleRefreshNotifications}
          onMarkAsRead={handleMarkAsRead}
        />

        <aside className="side-stack">
          <SystemStatus
            snapshot={systemSnapshot}
            loading={systemLoading}
            error={systemError}
            onRefresh={refreshSystemStatus}
          />
          <StreamEvents events={streamLogs} />
        </aside>
      </div>
    </main>
  );
}
