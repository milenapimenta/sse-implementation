import type { ErrorRequestHandler } from "express";
import type { AppLogger } from "../utils/logger";
export declare function createErrorHandler(options: {
    logger: AppLogger;
    exposeStack: boolean;
}): ErrorRequestHandler;
