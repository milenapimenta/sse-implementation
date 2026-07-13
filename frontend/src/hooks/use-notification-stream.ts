import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config/env";
import { sseClient } from "../services/sse-client";
import type { Notification } from "../types/notification";
import type { ConnectionStatus, StreamLog } from "../types/sse";
import { createStreamLog } from "../utils/stream-log";

export interface UseNotificationStreamOptions {
  userId: string | null;
  enabled?: boolean;
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

export function useNotificationStream({
  userId,
  enabled = false,
  onNotification,
  onStreamEvent
}: UseNotificationStreamOptions): UseNotificationStreamResult {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [lastEventId, setLastEventId] = useState<string | null>(() =>
    window.localStorage.getItem("notifications:lastEventId")
  );
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const onNotificationRef = useRef(onNotification);
  const onStreamEventRef = useRef(onStreamEvent);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    onStreamEventRef.current = onStreamEvent;
  }, [onStreamEvent]);

  const normalizedUserId = userId?.trim() ?? "";
  const previousUserIdRef = useRef(normalizedUserId);
  const streamUrl = useMemo(
    () =>
      normalizedUserId
        ? `${config.apiUrl}/api/notifications/stream?userId=${encodeURIComponent(
            normalizedUserId
          )}`
        : "",
    [normalizedUserId]
  );

  const emitLog = useCallback((type: StreamLog["type"], message: string) => {
    onStreamEventRef.current?.(createStreamLog(type, message));
  }, []);

  useEffect(() => {
    setStatus("idle");

    if (previousUserIdRef.current !== normalizedUserId) {
      previousUserIdRef.current = normalizedUserId;
      setLastHeartbeatAt(null);
      setLastEventId(null);
    }

    if (!normalizedUserId || !streamUrl) {
      return;
    }

    return sseClient.subscribe({
      userId: normalizedUserId,
      url: streamUrl,
      onStatusChange: setStatus,
      onConnected: () => emitLog("connected", "Stream conectado."),
      onNotification: (notification, eventId) => {
        if (eventId) {
          setLastEventId(eventId);
          window.localStorage.setItem("notifications:lastEventId", eventId);
        }

        onNotificationRef.current(notification);
        emitLog(
          "notification",
          `Notificacao ${notification.id} recebida para ${notification.userId}.`
        );
      },
      onPing: (timestamp) => {
        setLastHeartbeatAt(timestamp);
        emitLog("ping", `Heartbeat recebido em ${timestamp}.`);
      },
      onError: (message) => emitLog("error", message)
    });
  }, [emitLog, normalizedUserId, streamUrl]);

  const connect = useCallback(() => {
    if (!normalizedUserId || !streamUrl) {
      setStatus("error");
      emitLog("error", "Informe um usuario antes de conectar.");
      return;
    }

    sseClient.connect({ userId: normalizedUserId, url: streamUrl });
  }, [emitLog, normalizedUserId, streamUrl]);

  const disconnect = useCallback(() => {
    sseClient.disconnect("manual");
    emitLog("closed", "Stream desconectado manualmente.");
  }, [emitLog]);

  useEffect(() => {
    if (enabled) {
      connect();
    }
  }, [connect, enabled]);

  return {
    status,
    lastEventId,
    lastHeartbeatAt,
    connect,
    disconnect
  };
}
