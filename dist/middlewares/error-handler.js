"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createErrorHandler = createErrorHandler;
const zod_1 = require("zod");
const app_error_1 = require("../utils/app-error");
function createErrorHandler(options) {
    const { logger, exposeStack } = options;
    return (error, request, response, _next) => {
        void _next;
        if (response.headersSent) {
            request.socket.destroy();
            return;
        }
        if (error instanceof zod_1.ZodError) {
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
        if (error instanceof app_error_1.AppError) {
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
//# sourceMappingURL=error-handler.js.map