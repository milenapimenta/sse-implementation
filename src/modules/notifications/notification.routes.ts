import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../middlewares/async-handler";
import type { NotificationController } from "./notification.controller";
import type { SseHandler } from "../../sse/sse-handler";

export function createNotificationRoutes(options: {
  controller: NotificationController;
  sseHandler: SseHandler;
}): Router {
  const router = Router();

  const createNotificationRateLimit = rateLimit({
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
  router.get("/", asyncHandler(options.controller.list));
  router.post(
    "/",
    createNotificationRateLimit,
    asyncHandler(options.controller.create)
  );
  router.patch("/:id/read", asyncHandler(options.controller.markAsRead));

  return router;
}
