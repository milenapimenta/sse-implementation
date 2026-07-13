import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error";
import type { AppLogger } from "../utils/logger";

export function createErrorHandler(options: {
  logger: AppLogger;
  exposeStack: boolean;
}): ErrorRequestHandler {
  const { logger, exposeStack } = options;

  return (error, request, response, _next) => {
    void _next;

    if (response.headersSent) {
      request.socket.destroy();
      return;
    }

    if (error instanceof ZodError) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        }
      });
      return;
    }

    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
      return;
    }

    logger.error({ err: error }, "unhandled request error");

    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        ...(exposeStack && error instanceof Error ? { stack: error.stack } : {})
      }
    });
  };
}
