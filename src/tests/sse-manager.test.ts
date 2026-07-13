import { EventEmitter } from "node:events";
import type { Response } from "express";
import { describe, expect, it } from "vitest";
import { SseManager } from "../sse/sse-manager";
import { createTestLogger } from "./test-logger";

class FakeResponse extends EventEmitter {
  public chunks: string[] = [];
  public writableEnded = false;
  public destroyed = false;
  public writeResult = true;

  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return this.writeResult;
  }

  end(): void {
    this.writableEnded = true;
    this.emit("finish");
  }
}

function response(): Response {
  return new FakeResponse() as unknown as Response;
}

function fake(responseLike: Response): FakeResponse {
  return responseLike as unknown as FakeResponse;
}

describe("SseManager", () => {
  it("registers and removes connections", () => {
    const manager = new SseManager(createTestLogger());
    const client = manager.add("user-123", response());

    expect(manager.countConnections()).toBe(1);
    expect(manager.countUsers()).toBe(1);
    expect(manager.countConnectionsForUser("user-123")).toBe(1);

    expect(manager.remove(client.id, "test")).toBe(true);
    expect(manager.countConnections()).toBe(0);
    expect(manager.countUsers()).toBe(0);
  });

  it("allows multiple connections for the same user", () => {
    const manager = new SseManager(createTestLogger());

    manager.add("user-123", response());
    manager.add("user-123", response());

    expect(manager.countConnections()).toBe(2);
    expect(manager.countUsers()).toBe(1);
    expect(manager.countConnectionsForUser("user-123")).toBe(2);
  });

  it("sends events only to the requested user", () => {
    const manager = new SseManager(createTestLogger());
    const user123Response = response();
    const user456Response = response();

    manager.add("user-123", user123Response);
    manager.add("user-456", user456Response);

    const result = manager.sendToUser("user-123", {
      id: "1",
      event: "notification",
      data: { id: "1" }
    });

    expect(result.sent).toBe(1);
    expect(fake(user123Response).chunks).toHaveLength(1);
    expect(fake(user456Response).chunks).toHaveLength(0);
  });

  it("removes closed connections before writing", () => {
    const manager = new SseManager(createTestLogger());
    const closedResponse = response();
    const client = manager.add("user-123", closedResponse);
    fake(closedResponse).destroyed = true;

    const sent = manager.sendToClient(client, {
      event: "notification",
      data: { id: "1" }
    });

    expect(sent).toBe(false);
    expect(manager.countConnections()).toBe(0);
  });

  it("closes a slow connection when write returns false", () => {
    const manager = new SseManager(createTestLogger());
    const slowResponse = response();
    fake(slowResponse).writeResult = false;

    manager.add("user-123", slowResponse);
    const result = manager.sendToUser("user-123", {
      event: "notification",
      data: { id: "1" }
    });

    expect(result.removed).toBe(1);
    expect(manager.countConnections()).toBe(0);
    expect(fake(slowResponse).writableEnded).toBe(true);
  });
});
