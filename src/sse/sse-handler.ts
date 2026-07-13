import type { NextFunction, Request, Response } from "express";
import { getSimulatedUserId } from "../middlewares/simulated-auth";
import { notificationIdSchema } from "../modules/notifications/notification.schema";
import type { NotificationRepository } from "../modules/notifications/notification.repository";
import { AppError } from "../utils/app-error";
import type { AppLogger } from "../utils/logger";
import type { SseManager } from "./sse-manager";
import type { SseClient } from "./sse.types";

export type SseHandler = (
  request: Request,
  response: Response,
  next: NextFunction
) => void;

export function createSseHandler(options: {
  sseManager: SseManager;
  notificationRepository: NotificationRepository;
  heartbeatIntervalMs: number;
  retryMs: number;
  logger: AppLogger;
}): SseHandler {
  const {
    sseManager,
    notificationRepository,
    heartbeatIntervalMs,
    retryMs,
    logger
  } = options;

  return (request, response, next) => {
    try {
      const userId = getSimulatedUserId(request);

      if (!userId) {
        throw new AppError(
          401,
          "AUTH_REQUIRED",
          "Missing or invalid X-User-Id header"
        );
      }

      const lastEventId = parseLastEventId(request);

      request.socket.setKeepAlive(true);
      request.socket.setTimeout(0);
      response.setTimeout(0);
      response.status(200);
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();

      const client = sseManager.add(userId, response);

      request.on("close", () => {
        sseManager.remove(client.id, "client_closed");
      });

      sseManager.sendToClient(client, { retry: retryMs });
      sseManager.sendToClient(client, {
        event: "connected",
        data: { connected: true }
      });

      client.heartbeat = setInterval(() => {
        sseManager.sendToClient(client, {
          event: "ping",
          data: { timestamp: new Date().toISOString() }
        });
      }, heartbeatIntervalMs);

      if (client.closed && client.heartbeat) {
        clearInterval(client.heartbeat);
        client.heartbeat = undefined;
      }

      if (lastEventId) {
        void sendMissedNotifications({
          client,
          lastEventId,
          notificationRepository,
          sseManager,
          logger
        });
      }
    } catch (error) {
      next(error);
    }
  };
}

function parseLastEventId(request: Request): string | null {
  const raw = request.header("last-event-id");

  if (!raw) {
    return null;
  }

  return notificationIdSchema.parse(raw);
}

async function sendMissedNotifications(options: {
  client: SseClient;
  lastEventId: string;
  notificationRepository: NotificationRepository;
  sseManager: SseManager;
  logger: AppLogger;
}): Promise<void> {
  const { client, lastEventId, notificationRepository, sseManager, logger } =
    options;

  try {
    const missed = await notificationRepository.findAfterIdForUser(
      client.userId,
      lastEventId
    );

    for (const notification of missed) {
      if (client.closed) {
        return;
      }

      sseManager.sendToClient(client, {
        id: notification.id,
        event: "notification",
        data: notification
      });
    }

    if (missed.length > 0) {
      logger.info(
        {
          clientId: client.id,
          userId: client.userId,
          lastEventId,
          recovered: missed.length
        },
        "missed sse notifications recovered"
      );
    }
  } catch (error) {
    logger.error(
      { err: error, clientId: client.id, userId: client.userId, lastEventId },
      "failed to recover missed notifications"
    );

    sseManager.sendToClient(client, {
      event: "error",
      data: { message: "Failed to recover missed notifications" }
    });
    sseManager.closeClient(client.id, "recovery_failed");
  }
}
