import type { Notification } from "./notification";

export type SseConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type ConnectionStatus = SseConnectionStatus;

export interface StreamLog {
  id: string;
  type: "connected" | "notification" | "ping" | "error" | "closed";
  message: string;
  timestamp: string;
}

export interface ConnectedEventData {
  connected: boolean;
}

export interface PingEventData {
  timestamp: string;
}

export interface SseConnectOptions {
  url: string;
  userId: string;
}

export interface SseSubscriber extends SseConnectOptions {
  onConnected?: () => void;
  onNotification?: (
    notification: Notification,
    lastEventId: string
  ) => void;
  onPing?: (timestamp: string) => void;
  onError?: (message: string) => void;
  onStatusChange?: (status: SseConnectionStatus) => void;
}

export interface SseClientContract {
  connect(options: SseConnectOptions): void;
  disconnect(reason?: string): void;
  subscribe(subscriber: SseSubscriber): () => void;
  isConnected(): boolean;
  getStatus(): SseConnectionStatus;
  getCurrentUserId(): string | null;
}
