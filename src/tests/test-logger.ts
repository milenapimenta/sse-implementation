import { createLogger } from "../utils/logger";

export function createTestLogger() {
  return createLogger({
    LOG_LEVEL: "silent",
    NODE_ENV: "test"
  });
}
