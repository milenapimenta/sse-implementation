import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config/env";
import type { Notification } from "../types/notification";
import type {
  ConnectedEventData,
  ConnectionStatus,
  PingEventData,
  StreamLog
} from "../types/sse";
import { createStreamLog } from "../utils/stream-log";

export interface UseNotificationStreamOptions {
  userId: string;
  onNotification: (notification: Notification) => void;
  onStreamEvent?: (event: StreamLog) => void;
}

export interface UseNotificationStreamResult {
  status: ConnectionStatus;
  lastEventId: string | null;
  lastHeartbeatAt: string | null;
  connect: () => void;
  disconnect: () => void;
}

function parseEventData<T>(event: MessageEvent<string>): T {
  return JSON.parse(event.data) as T;
}

export function useNotificationStream({
  userId,
  onNotification,
  onStreamEvent
}: UseNotificationStreamOptions): UseNotificationStreamResult {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [lastEventId, setLastEventId] = useState<string | null>(() =>
    window.localStorage.getItem("notifications:lastEventId")
  );
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const onNotificationRef = useRef(onNotification);
  const onStreamEventRef = useRef(onStreamEvent);
  const previousUserIdRef = useRef(userId);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    onStreamEventRef.current = onStreamEvent;
  }, [onStreamEvent]);

  const emitLog = useCallback((type: StreamLog["type"], message: string) => {
    onStreamEventRef.current?.(createStreamLog(type, message));
  }, []);

  const closeCurrent = useCallback(
    (nextStatus: ConnectionStatus, logMessage?: string) => {
      const current = eventSourceRef.current;

      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;

      if (current) {
        current.close();
      }

      eventSourceRef.current = null;
      setStatus(nextStatus);

      if (logMessage) {
        emitLog("closed", logMessage);
      }
    },
    [emitLog]
  );

  const connect = useCallback(() => {
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      setStatus("error");
      emitLog("error", "Informe um usuario antes de conectar.");
      return;
    }

    if (eventSourceRef.current) {
      if (eventSourceRef.current.readyState !== EventSource.CLOSED) {
        return;
      }

      closeCurrent("idle");
    }

    setStatus("connecting");
    const url = `${config.apiUrl}/api/notifications/stream?userId=${encodeURIComponent(
      normalizedUserId
    )}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    const handleOpen = () => {
      setStatus("connected");
    };

    const handleConnected = (event: MessageEvent<string>) => {
      const data = parseEventData<ConnectedEventData>(event);
      setStatus(data.connected ? "connected" : "connecting");
      emitLog("connected", "Stream conectado.");
    };

    const handleNotification = (event: MessageEvent<string>) => {
      const notification = parseEventData<Notification>(event);

      if (event.lastEventId) {
        setLastEventId(event.lastEventId);
        window.localStorage.setItem("notifications:lastEventId", event.lastEventId);
      }

      onNotificationRef.current(notification);
      emitLog(
        "notification",
        `Notificacao ${notification.id} recebida para ${notification.userId}.`
      );
    };

    const handlePing = (event: MessageEvent<string>) => {
      const data = parseEventData<PingEventData>(event);
      setLastHeartbeatAt(data.timestamp);
      emitLog("ping", `Heartbeat recebido em ${data.timestamp}.`);
    };

    const handleError = () => {
      if (eventSource.readyState === EventSource.CONNECTING) {
        setStatus("reconnecting");
        emitLog("error", "Conexao perdida. O navegador tentara reconectar.");
        return;
      }

      if (eventSource.readyState === EventSource.CLOSED) {
        setStatus("error");
        emitLog("error", "Stream fechado com erro.");
      }
    };

    eventSource.addEventListener("open", handleOpen);
    eventSource.addEventListener("connected", handleConnected);
    eventSource.addEventListener("notification", handleNotification);
    eventSource.addEventListener("ping", handlePing);
    eventSource.addEventListener("error", handleError);

    cleanupListenersRef.current = () => {
      eventSource.removeEventListener("open", handleOpen);
      eventSource.removeEventListener("connected", handleConnected);
      eventSource.removeEventListener("notification", handleNotification);
      eventSource.removeEventListener("ping", handlePing);
      eventSource.removeEventListener("error", handleError);
    };
  }, [closeCurrent, emitLog, userId]);

  const disconnect = useCallback(() => {
    closeCurrent("disconnected", "Stream desconectado manualmente.");
  }, [closeCurrent]);

  useEffect(() => {
    if (previousUserIdRef.current === userId) {
      return;
    }

    previousUserIdRef.current = userId;
    closeCurrent("idle");
    setLastHeartbeatAt(null);
    setLastEventId(null);
  }, [closeCurrent, userId]);

  useEffect(() => {
    return () => {
      closeCurrent("disconnected");
    };
  }, [closeCurrent]);

  return {
    status,
    lastEventId,
    lastHeartbeatAt,
    connect,
    disconnect
  };
}
