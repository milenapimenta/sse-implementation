import type { Request, Response } from "express";
import { AppError } from "../../utils/app-error";
import type { AppLogger } from "../../utils/logger";
import { getSimulatedUserId } from "../../middlewares/simulated-auth";
import {
  createNotificationSchema,
  listNotificationsQuerySchema,
  notificationIdSchema
} from "./notification.schema";
import type { NotificationService } from "./notification.service";

export class NotificationController {
  constructor(
    private readonly service: NotificationService,
    private readonly logger: AppLogger
  ) {}

  create = async (request: Request, response: Response): Promise<void> => {
    const payload = createNotificationSchema.parse(request.body);

    const notification = await this.service.create(payload);
    response.status(201).json(notification);
  };

  list = async (request: Request, response: Response): Promise<void> => {
    const userId = getSimulatedUserId(request);

    if (!userId) {
      throw new AppError(
        401,
        "AUTH_REQUIRED",
        "Missing or invalid X-User-Id header"
      );
    }

    const query = listNotificationsQuerySchema.parse(request.query);
    const notifications = await this.service.list({
      userId,
      limit: query.limit,
      cursor: query.cursor,
      unreadOnly: query.unreadOnly
    });

    response.json({ data: notifications });
  };

  markAsRead = async (
    request: Request,
    response: Response
  ): Promise<void> => {
    const userId = getSimulatedUserId(request);

    if (!userId) {
      throw new AppError(
        401,
        "AUTH_REQUIRED",
        "Missing or invalid X-User-Id header"
      );
    }

    const id = notificationIdSchema.parse(request.params.id);
    const notification = await this.service.markAsRead(id, userId);

    if (!notification) {
      this.logger.warn({ notificationId: id, userId }, "notification not found");
      throw new AppError(404, "NOT_FOUND", "Notification not found");
    }

    response.json(notification);
  };
}
