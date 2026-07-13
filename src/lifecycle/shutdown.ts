import type http from "node:http";
import type { SseManager } from "../sse/sse-manager";
import type { AppLogger } from "../utils/logger";

type ShutdownSignal = NodeJS.Signals;

export interface GracefulShutdownOptions {
  server: http.Server;
  sseManager: SseManager;
  logger: AppLogger;
  closeRedisClients: () => Promise<void>;
  closePostgresPool: () => Promise<void>;
  timeoutMs?: number;
}

export function registerGracefulShutdown(
  options: GracefulShutdownOptions
): void {
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (signal: ShutdownSignal): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = performGracefulShutdown(options, signal);
    return shutdownPromise;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT")
      .then(() => process.exit(0))
      .catch((error) => {
        options.logger.fatal({ err: error }, "graceful shutdown failed");
        process.exit(1);
      });
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM")
      .then(() => process.exit(0))
      .catch((error) => {
        options.logger.fatal({ err: error }, "graceful shutdown failed");
        process.exit(1);
      });
  });
}

async function performGracefulShutdown(
  options: GracefulShutdownOptions,
  signal: ShutdownSignal
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;

  options.logger.info({ signal }, "graceful shutdown started");

  const closeServer = new Promise<void>((resolve, reject) => {
    options.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  options.sseManager.closeAll({
    event: "shutdown",
    data: { reason: "server_shutdown" }
  });

  await withTimeout(closeServer, timeoutMs, "HTTP server shutdown timed out")
    .catch((error) => {
      options.logger.warn({ err: error }, "http server shutdown timed out");
    });

  await withTimeout(
    options.closeRedisClients(),
    timeoutMs,
    "Redis shutdown timed out"
  );
  await withTimeout(
    options.closePostgresPool(),
    timeoutMs,
    "PostgreSQL shutdown timed out"
  );

  options.logger.info("graceful shutdown finished");
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
