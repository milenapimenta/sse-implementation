import type { Request, Response } from "express";
import type { AppLogger } from "../../utils/logger";
import type { NotificationService } from "./notification.service";
export declare class NotificationController {
    private readonly service;
    private readonly logger;
    constructor(service: NotificationService, logger: AppLogger);
    create: (request: Request, response: Response) => Promise<void>;
    list: (request: Request, response: Response) => Promise<void>;
    markAsRead: (request: Request, response: Response) => Promise<void>;
}
