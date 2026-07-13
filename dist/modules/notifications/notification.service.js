"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const redis_1 = require("../../redis/redis");
class NotificationService {
    repository;
    publisher;
    logger;
    constructor(repository, publisher, logger) {
        this.repository = repository;
        this.publisher = publisher;
        this.logger = logger;
    }
    async create(input) {
        const notification = await this.repository.create(input);
        const message = {
            event: "notification.created",
            notification
        };
        await this.publisher.publish(redis_1.NOTIFICATIONS_CHANNEL, JSON.stringify(message));
        this.logger.info({ notificationId: notification.id, userId: notification.userId }, "notification event published to redis");
        return notification;
    }
    async list(options) {
        return this.repository.list(options);
    }
    async markAsRead(id, userId) {
        return this.repository.markAsRead(id, userId);
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map