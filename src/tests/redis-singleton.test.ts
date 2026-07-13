import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SseManager } from "../sse/sse-manager";

const createdRedisClients: FakeRedis[] = [];

class FakeRedis extends EventEmitter {
  status = "wait";
  readonly url: string;
  readonly options: unknown;
  connectCalls = 0;
  pingCalls = 0;
  quitCalls = 0;
  disconnectCalls = 0;
  subscribeCalls: string[] = [];
  unsubscribeCalls: string[] = [];
  published: Array<{ channel: string; message: string }> = [];

  constructor(url: string, options: unknown) {
    super();
    this.url = url;
    this.options = options;
    createdRedisClients.push(this);
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.status = "ready";
  }

  async ping(): Promise<string> {
    this.pingCalls += 1;
    return "PONG";
  }

  async publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message });
    return 1;
  }

  async subscribe(channel: string): Promise<number> {
    this.subscribeCalls.push(channel);
    return this.subscribeCalls.length;
  }

  async unsubscribe(channel: string): Promise<number> {
    this.unsubscribeCalls.push(channel);
    return this.unsubscribeCalls.length;
  }

  async quit(): Promise<string> {
    this.quitCalls += 1;
    this.status = "end";
    return "OK";
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.status = "end";
  }
}

vi.mock("ioredis", () => ({
  default: FakeRedis
}));

const config = {
  REDIS_URL: "redis://localhost:6379"
};

async function loadRedisModule() {
  vi.resetModules();
  createdRedisClients.length = 0;
  return import("../redis/redis");
}

function createSseManagerStub(): SseManager {
  return {
    sendToUser: vi.fn(() => ({
      attempted: 0,
      sent: 0,
      removed: 0
    }))
  } as unknown as SseManager;
}

describe("Redis singletons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one singleton per role and keeps the roles distinct", async () => {
    const redis = await loadRedisModule();

    const commandA = redis.getRedisClient({ env: config });
    const commandB = redis.getRedisClient({ env: config });
    const publisherA = redis.getRedisPublisher({ env: config });
    const publisherB = redis.getRedisPublisher({ env: config });
    const subscriberA = redis.getRedisSubscriber({ env: config });
    const subscriberB = redis.getRedisSubscriber({ env: config });

    expect(commandA).toBe(commandB);
    expect(publisherA).toBe(publisherB);
    expect(subscriberA).toBe(subscriberB);
    expect(commandA).not.toBe(publisherA);
    expect(commandA).not.toBe(subscriberA);
    expect(publisherA).not.toBe(subscriberA);
    expect(createdRedisClients).toHaveLength(3);
    expect((subscriberA as unknown as FakeRedis).listenerCount("message")).toBe(
      0
    );
  });

  it("connects a client only once when connection calls overlap", async () => {
    const redis = await loadRedisModule();
    const command = redis.getRedisClient({ env: config });
    const fakeCommand = command as unknown as FakeRedis;

    await Promise.all([
      redis.connectRedisClient("command", { env: config }),
      redis.connectRedisClient("command", { env: config })
    ]);

    expect(fakeCommand.connectCalls).toBe(1);
    expect(createdRedisClients).toHaveLength(1);
  });

  it("initializes the notification subscriber once and registers one message listener", async () => {
    const redis = await loadRedisModule();
    const sseManager = createSseManagerStub();

    await Promise.all([
      redis.initializeNotificationSubscriber({
        env: config,
        sseManager
      }),
      redis.initializeNotificationSubscriber({
        env: config,
        sseManager
      })
    ]);

    const subscriber = redis.getRedisSubscriber({ env: config });
    const fakeSubscriber = subscriber as unknown as FakeRedis;

    expect(fakeSubscriber.connectCalls).toBe(1);
    expect(fakeSubscriber.subscribeCalls).toEqual([
      redis.NOTIFICATIONS_CHANNEL
    ]);
    expect(fakeSubscriber.listenerCount("message")).toBe(1);
  });

  it("routes subscribed notification messages through the SSE manager", async () => {
    const redis = await loadRedisModule();
    const sseManager = createSseManagerStub();

    await redis.initializeNotificationSubscriber({
      env: config,
      sseManager
    });

    const subscriber = redis.getRedisSubscriber({ env: config });
    const fakeSubscriber = subscriber as unknown as FakeRedis;
    fakeSubscriber.emit(
      "message",
      redis.NOTIFICATIONS_CHANNEL,
      JSON.stringify({
        event: "notification.created",
        notification: {
          id: "1",
          userId: "user-123",
          type: "message",
          title: "Nova mensagem",
          message: "Teste",
          data: null,
          readAt: null,
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      })
    );

    expect(sseManager.sendToUser).toHaveBeenCalledTimes(1);
    expect(sseManager.sendToUser).toHaveBeenCalledWith("user-123", {
      id: "1",
      event: "notification",
      data: expect.objectContaining({ id: "1", userId: "user-123" })
    });
  });

  it("health checks reuse the command client", async () => {
    const redis = await loadRedisModule();
    const command = redis.getRedisClient({ env: config });
    const fakeCommand = command as unknown as FakeRedis;

    await redis.checkRedis(command, 100);

    expect(fakeCommand.pingCalls).toBe(1);
    expect(createdRedisClients).toHaveLength(1);
  });

  it("closes each Redis client only once and removes the app subscriber listener", async () => {
    const redis = await loadRedisModule();
    const sseManager = createSseManagerStub();
    const clients = redis.getRedisClients({ env: config });

    await redis.connectRedisClients({ env: config });
    await redis.initializeNotificationSubscriber({
      env: config,
      sseManager
    });

    await Promise.all([redis.closeRedisClients(), redis.closeRedisClients()]);
    await redis.closeRedisClients();

    const subscriber = clients.subscriber as unknown as FakeRedis;
    const publisher = clients.publisher as unknown as FakeRedis;
    const command = clients.general as unknown as FakeRedis;

    expect(subscriber.unsubscribeCalls).toEqual([
      redis.NOTIFICATIONS_CHANNEL
    ]);
    expect(subscriber.listenerCount("message")).toBe(0);
    expect(subscriber.quitCalls).toBe(1);
    expect(publisher.quitCalls).toBe(1);
    expect(command.quitCalls).toBe(1);
    expect(() => redis.getRedisClient({ env: config })).toThrow(
      /shutting down/
    );
  });
});
