import type { StreamLog } from "../types/sse";

function createLogId(): string {
  if ("crypto" in window && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createStreamLog(
  type: StreamLog["type"],
  message: string,
  timestamp = new Date().toISOString()
): StreamLog {
  return {
    id: createLogId(),
    type,
    message,
    timestamp
  };
}
