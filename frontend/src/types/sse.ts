export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

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
