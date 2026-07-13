"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
function createLogger(env) {
    return (0, pino_1.default)({
        level: env.LOG_LEVEL,
        base: undefined,
        redact: {
            paths: ["req.headers.authorization", "req.headers.cookie"],
            remove: true
        },
        transport: env.NODE_ENV === "development"
            ? {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    ignore: "pid,hostname"
                }
            }
            : undefined
    });
}
//# sourceMappingURL=logger.js.map