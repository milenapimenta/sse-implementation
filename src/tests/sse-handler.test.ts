import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { NotificationRepository } from "../modules/notifications/notification.repository";
import { createSseHandler } from "../sse/sse-handler";
import { SseManager } from "../sse/sse-manager";
import { createTestLogger } from "./test-logger";

class FakeRequest extends EventEmitter {
  readonly query = { userId: "user-123" };
  readonly socket = {
    setKeepAlive: vi.fn(),
    setTimeout: vi.fn()
  };

  header(): string | undefined {
    return undefined;
  }
}

class FakeResponse extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  readonly setTimeout = vi.fn();
  readonly setHeader = vi.fn();
  readonly flushHeaders = vi.fn();
  readonly write = vi.fn(() => true);

  status(): this {
    return this;
  }

  end(): void {
    this.writableEnded = true;
  }
}

function createHandlerContext() {
  const request = new FakeRequest();
  const response = new FakeResponse();
  const sseManager = new SseManager(createTestLogger());
  const handler = createSseHandler({
    sseManager,
    notificationRepository: {} as NotificationRepository,
    heartbeatIntervalMs: 60_000,
    retryMs: 3_000,
    logger: createTestLogger()
  });

  handler(
    request as unknown as Request,
    response as unknown as Response,
    vi.fn()
  );

  return { request, response, sseManager };
}

describe("createSseHandler cleanup", () => {
  it.each([
    ["request close", "request", "close"],
    ["response close", "response", "close"],
    ["response error", "response", "error"]
  ] as const)("cleans up on %s", (_name, emitterName, eventName) => {
    const context = createHandlerContext();
    const emitter = context[emitterName];

    expect(context.sseManager.countConnections()).toBe(1);
    emitter.emit(eventName, eventName === "error" ? new Error("closed") : undefined);

    expect(context.sseManager.countConnections()).toBe(0);
    expect(context.request.listenerCount("close")).toBe(0);
    expect(context.response.listenerCount("close")).toBe(0);
    expect(context.response.listenerCount("error")).toBe(0);
  });
});
