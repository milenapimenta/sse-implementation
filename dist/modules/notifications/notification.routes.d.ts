import { Router } from "express";
import type { NotificationController } from "./notification.controller";
import type { SseHandler } from "../../sse/sse-handler";
export declare function createNotificationRoutes(options: {
    controller: NotificationController;
    sseHandler: SseHandler;
}): Router;
