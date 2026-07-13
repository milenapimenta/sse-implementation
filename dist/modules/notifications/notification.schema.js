"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNotificationsQuerySchema = exports.createNotificationSchema = exports.notificationIdSchema = exports.userIdSchema = void 0;
const zod_1 = require("zod");
exports.userIdSchema = zod_1.z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._:@-]+$/, "Use a simple user id");
exports.notificationIdSchema = zod_1.z
    .string()
    .trim()
    .regex(/^\d+$/, "Notification id must be a numeric event id");
exports.createNotificationSchema = zod_1.z.object({
    userId: exports.userIdSchema,
    type: zod_1.z.string().trim().min(1).max(64),
    title: zod_1.z.string().trim().min(1).max(160),
    message: zod_1.z.string().trim().min(1).max(2000),
    data: zod_1.z.record(zod_1.z.unknown()).nullable().optional()
});
exports.listNotificationsQuerySchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    cursor: exports.notificationIdSchema.optional(),
    unreadOnly: zod_1.z
        .union([zod_1.z.literal("true"), zod_1.z.literal("false"), zod_1.z.boolean()])
        .optional()
        .transform((value) => value === true || value === "true")
});
//# sourceMappingURL=notification.schema.js.map