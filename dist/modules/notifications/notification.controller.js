"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const app_error_1 = require("../../utils/app-error");
const simulated_auth_1 = require("../../middlewares/simulated-auth");
const notification_schema_1 = require("./notification.schema");
class NotificationController {
    service;
    logger;
    constructor(service, logger) {
        this.service = service;
        this.logger = logger;
    }
    create = async (request, response) => {
        const payload = notification_schema_1.createNotificationSchema.parse(request.body);
        const notification = await this.service.create(payload);
        response.status(201).json(notification);
    };
    list = async (request, response) => {
        const userId = (0, simulated_auth_1.getSimulatedUserId)(request);
        if (!userId) {
            throw new app_error_1.AppError(401, "AUTH_REQUIRED", "Missing or invalid X-User-Id header");
        }
        const query = notification_schema_1.listNotificationsQuerySchema.parse(request.query);
        const notifications = await this.service.list({
            userId,
            limit: query.limit,
            cursor: query.cursor,
            unreadOnly: query.unreadOnly
        });
        response.json({ data: notifications });
    };
    markAsRead = async (request, response) => {
        const userId = (0, simulated_auth_1.getSimulatedUserId)(request);
        if (!userId) {
            throw new app_error_1.AppError(401, "AUTH_REQUIRED", "Missing or invalid X-User-Id header");
        }
        const id = notification_schema_1.notificationIdSchema.parse(request.params.id);
        const notification = await this.service.markAsRead(id, userId);
        if (!notification) {
            this.logger.warn({ notificationId: id, userId }, "notification not found");
            throw new app_error_1.AppError(404, "NOT_FOUND", "Notification not found");
        }
        response.json(notification);
    };
}
exports.NotificationController = NotificationController;
//# sourceMappingURL=notification.controller.js.map