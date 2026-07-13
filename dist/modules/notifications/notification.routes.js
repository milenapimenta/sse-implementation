"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotificationRoutes = createNotificationRoutes;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const async_handler_1 = require("../../middlewares/async-handler");
function createNotificationRoutes(options) {
    const router = (0, express_1.Router)();
    const createNotificationRateLimit = (0, express_rate_limit_1.default)({
        windowMs: 60_000,
        limit: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            error: {
                code: "RATE_LIMITED",
                message: "Too many notification creation requests"
            }
        }
    });
    router.get("/stream", options.sseHandler);
    router.get("/", (0, async_handler_1.asyncHandler)(options.controller.list));
    router.post("/", createNotificationRateLimit, (0, async_handler_1.asyncHandler)(options.controller.create));
    router.patch("/:id/read", (0, async_handler_1.asyncHandler)(options.controller.markAsRead));
    return router;
}
//# sourceMappingURL=notification.routes.js.map