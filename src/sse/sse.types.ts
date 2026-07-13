import type { Response } from "express";

export interface SseEvent {
  id?: string;
  event?: string;
  data?: unknown;
  retry?: number;
  comment?: string;
}

export interface SseClient {
  id: string;
  userId: string;
  response: Response;
  heartbeat?: NodeJS.Timeout;
  closed: boolean;
  createdAt: Date;
}

export interface SendResult {
  attempted: number;
  sent: number;
  removed: number;
}
