import type { NextFunction, Request, Response } from "express";
import type { NotificationRepository } from "../modules/notifications/notification.repository";
import type { AppLogger } from "../utils/logger";
import type { SseManager } from "./sse-manager";
export type SseHandler = (request: Request, response: Response, next: NextFunction) => void;
export declare function createSseHandler(options: {
    sseManager: SseManager;
    notificationRepository: NotificationRepository;
    heartbeatIntervalMs: number;
    retryMs: number;
    logger: AppLogger;
}): SseHandler;
