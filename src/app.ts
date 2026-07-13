import path from "node:path";
import cors from "cors";
import express, { type Router } from "express";
import pinoHttp from "pino-http";
import type { Env } from "./config/env";
import { asyncHandler } from "./middlewares/async-handler";
import { createErrorHandler } from "./middlewares/error-handler";
import type { SseManager } from "./sse/sse-manager";
import type { AppLogger } from "./utils/logger";

export interface HealthChecks {
  postgres: () => Promise<void>;
  redis: () => Promise<void>;
}

export interface AppResourceMetrics {
  postgres?: {
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
  };
  redis?: {
    command: string;
    publisher: string;
    subscriber: string;
  };
}

export function createApp(options: {
  env: Env;
  logger: AppLogger;
  notificationRoutes: Router;
  sseManager: SseManager;
  healthChecks: HealthChecks;
  resourceMetrics?: () => AppResourceMetrics;
}) {
  const app = express();
  const publicDir = path.resolve(process.cwd(), "public");

  app.disable("x-powered-by");
  app.use(pinoHttp({ logger: options.logger }));
  app.use(
    cors({
      origin:
        options.env.CORS_ORIGIN === "*"
          ? "*"
          : options.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    })
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(express.static(publicDir));

  app.get(
    "/health",
    asyncHandler(async (_request, response) => {
      const [postgres, redis] = await Promise.allSettled([
        options.healthChecks.postgres(),
        options.healthChecks.redis()
      ]);

      const healthy =
        postgres.status === "fulfilled" && redis.status === "fulfilled";

      response.status(healthy ? 200 : 503).json({
        api: "ok",
        postgres: postgres.status === "fulfilled" ? "ok" : "error",
        redis: redis.status === "fulfilled" ? "ok" : "error"
      });
    })
  );

  app.get("/metrics", (_request, response) => {
    const sse = {
      connections: options.sseManager.countConnections(),
      connectedUsers: options.sseManager.countUsers()
    };

    response.json({
      sseConnections: sse.connections,
      connectedUsers: sse.connectedUsers,
      sse,
      ...options.resourceMetrics?.()
    });
  });

  app.use("/api/notifications", options.notificationRoutes);

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found"
      }
    });
  });

  app.use(
    createErrorHandler({
      logger: options.logger,
      exposeStack: options.env.NODE_ENV !== "production"
    })
  );

  return app;
}
