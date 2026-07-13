"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const node_path_1 = __importDefault(require("node:path"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const pino_http_1 = __importDefault(require("pino-http"));
const async_handler_1 = require("./middlewares/async-handler");
const error_handler_1 = require("./middlewares/error-handler");
function createApp(options) {
    const app = (0, express_1.default)();
    const publicDir = node_path_1.default.resolve(process.cwd(), "public");
    app.disable("x-powered-by");
    app.use((0, pino_http_1.default)({ logger: options.logger }));
    app.use((0, cors_1.default)({
        origin: options.env.CORS_ORIGIN === "*"
            ? "*"
            : options.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    }));
    app.use(express_1.default.json({ limit: "32kb" }));
    app.use(express_1.default.static(publicDir));
    app.get("/health", (0, async_handler_1.asyncHandler)(async (_request, response) => {
        const [postgres, redis] = await Promise.allSettled([
            options.healthChecks.postgres(),
            options.healthChecks.redis()
        ]);
        const healthy = postgres.status === "fulfilled" && redis.status === "fulfilled";
        response.status(healthy ? 200 : 503).json({
            api: "ok",
            postgres: postgres.status === "fulfilled" ? "ok" : "error",
            redis: redis.status === "fulfilled" ? "ok" : "error"
        });
    }));
    app.get("/metrics", (_request, response) => {
        response.json({
            sseConnections: options.sseManager.countConnections(),
            connectedUsers: options.sseManager.countUsers()
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
    app.use((0, error_handler_1.createErrorHandler)({
        logger: options.logger,
        exposeStack: options.env.NODE_ENV !== "production"
    }));
    return app;
}
//# sourceMappingURL=app.js.map