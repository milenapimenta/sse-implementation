import http, { type IncomingMessage } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { loadEnv, type Env } from "../config/env";
import { runMigrations } from "../database/migrate";
import {
  checkPostgres,
  closePostgresPool,
  getPostgresPool,
  getPostgresPoolMetrics,
  resetPostgresPoolForTests
} from "../database/postgres";
import { NotificationController } from "../modules/notifications/notification.controller";
import { NotificationRepository } from "../modules/notifications/notification.repository";
import { createNotificationRoutes } from "../modules/notifications/notification.routes";
import { NotificationService } from "../modules/notifications/notification.service";
import {
  checkRedis,
  closeRedisClients,
  connectRedisClients,
  getRedisClients,
  getRedisStatusMetrics,
  initializeNotificationSubscriber,
  resetRedisClientsForTests,
  type RedisClients
} from "../redis/redis";
import { createSseHandler } from "../sse/sse-handler";
import { SseManager } from "../sse/sse-manager";
import type { Notification } from "../modules/notifications/notification.types";
import { createTestLogger } from "./test-logger";
import type { Pool } from "pg";
import type { AppLogger } from "../utils/logger";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";

interface ParsedSseEvent {
  event: string;
  id?: string;
  data?: unknown;
  rawData?: string;
}

class SseTestClient {
  private buffer = "";
  private readonly events: ParsedSseEvent[] = [];
  private readonly waiters = new Set<{
    eventName: string;
    predicate: (event: ParsedSseEvent) => boolean;
    resolve: (event: ParsedSseEvent) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(
    private readonly request: http.ClientRequest,
    private readonly response: IncomingMessage
  ) {
    this.response.setEncoding("utf8");
    this.response.on("data", (chunk: string) => this.onChunk(chunk));
  }

  waitForEvent(
    eventName: string,
    predicate: (event: ParsedSseEvent) => boolean = () => true,
    timeoutMs = 3000
  ): Promise<ParsedSseEvent> {
    const existing = this.events.find(
      (event) => event.event === eventName && predicate(event)
    );

    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        eventName,
        predicate,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`Timed out waiting for SSE event ${eventName}`));
        }, timeoutMs)
      };
      this.waiters.add(waiter);
    });
  }

  close(): void {
    this.request.destroy();
    this.response.destroy();
  }

  private onChunk(chunk: string): void {
    this.buffer += chunk;

    while (this.buffer.includes("\n\n")) {
      const index = this.buffer.indexOf("\n\n");
      const block = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      const event = parseSseBlock(block);

      if (event) {
        this.events.push(event);
        this.resolveWaiters(event);
      }
    }
  }

  private resolveWaiters(event: ParsedSseEvent): void {
    for (const waiter of [...this.waiters]) {
      if (waiter.eventName === event.event && waiter.predicate(event)) {
        clearTimeout(waiter.timeout);
        this.waiters.delete(waiter);
        waiter.resolve(event);
      }
    }
  }
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  const event: ParsedSseEvent = { event: "message" };
  const dataLines: string[] = [];

  for (const rawLine of block.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) {
      continue;
    }

    const separator = rawLine.indexOf(":");
    const field = separator === -1 ? rawLine : rawLine.slice(0, separator);
    const value =
      separator === -1 ? "" : rawLine.slice(separator + 1).replace(/^ /, "");

    if (field === "event") {
      event.event = value;
    }

    if (field === "id") {
      event.id = value;
    }

    if (field === "data") {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0 && event.event === "message" && !event.id) {
    return null;
  }

  if (dataLines.length > 0) {
    event.rawData = dataLines.join("\n");
    event.data = JSON.parse(event.rawData);
  }

  return event;
}

async function openSse(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<SseTestClient> {
  return new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}${path}`, { headers }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Unexpected SSE status ${response.statusCode}`));
        response.resume();
        return;
      }

      resolve(new SseTestClient(request, response));
    });

    request.on("error", reject);
    request.end();
  });
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: (await response.json()) as T
  };
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 3000
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }

  throw new Error("Timed out waiting for condition");
}

describe.skipIf(!runIntegration)("SSE integration", () => {
  let config: Env;
  let logger: AppLogger;
  let pool: Pool;
  let redisClients: RedisClients;
  let repository: NotificationRepository;
  let service: NotificationService;
  let sseManager: SseManager;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    config = {
      ...loadEnv(process.env),
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      SSE_HEARTBEAT_INTERVAL_MS: 1000,
      SSE_RETRY_MS: 50
    };
    logger = createTestLogger();
    await resetPostgresPoolForTests();
    await resetRedisClientsForTests();

    pool = getPostgresPool({ env: config, logger });
    redisClients = getRedisClients({ env: config, logger });

    await runMigrations(pool);
    await connectRedisClients({ env: config, logger });

    repository = new NotificationRepository(pool);
    service = new NotificationService(repository, redisClients.publisher, logger);
    sseManager = new SseManager(logger);

    await initializeNotificationSubscriber({
      env: config,
      sseManager,
      logger
    });

    const controller = new NotificationController(service, logger);
    const sseHandler = createSseHandler({
      sseManager,
      notificationRepository: repository,
      heartbeatIntervalMs: config.SSE_HEARTBEAT_INTERVAL_MS,
      retryMs: config.SSE_RETRY_MS,
      logger
    });

    const app = createApp({
      env: config,
      logger,
      notificationRoutes: createNotificationRoutes({ controller, sseHandler }),
      sseManager,
      healthChecks: {
        postgres: () => checkPostgres(pool),
        redis: () => checkRedis(redisClients.general)
      },
      resourceMetrics: () => ({
        postgres: getPostgresPoolMetrics(),
        redis: getRedisStatusMetrics()
      })
    });

    server = http.createServer(app);
    server.timeout = 0;
    server.requestTimeout = 0;

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await pool.query("truncate table notifications restart identity");
  });

  afterEach(() => {
    sseManager.closeAll();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await closeRedisClients();
    await closePostgresPool();
    await resetRedisClientsForTests();
    await resetPostgresPoolForTests();
  });

  it("delivers a created notification only to the target user and persists it", async () => {
    const user123 = await openSse(baseUrl, "/api/notifications/stream", {
      "X-User-Id": "user-123"
    });
    const user456 = await openSse(baseUrl, "/api/notifications/stream", {
      "X-User-Id": "user-456"
    });

    await user123.waitForEvent("connected");
    await user456.waitForEvent("connected");

    const created = await postJson<Notification>(
      baseUrl,
      "/api/notifications",
      {
        userId: "user-123",
        type: "message",
        title: "Nova mensagem",
        message: "Voce recebeu uma nova mensagem.",
        data: { conversationId: "conversation-456" }
      }
    );

    expect(created.status).toBe(201);

    const event = await user123.waitForEvent(
      "notification",
      (candidate) => candidate.id === created.body.id
    );

    expect(event.data).toMatchObject({
      id: created.body.id,
      userId: "user-123",
      title: "Nova mensagem"
    });
    await expect(
      user456.waitForEvent("notification", () => true, 300)
    ).rejects.toThrow(/Timed out/);
    expect(await repository.countByUser("user-123")).toBe(1);

    user123.close();
    user456.close();
  });

  it("delivers the same notification to multiple connections of one user", async () => {
    const first = await openSse(baseUrl, "/api/notifications/stream", {
      "X-User-Id": "user-123"
    });
    const second = await openSse(baseUrl, "/api/notifications/stream", {
      "X-User-Id": "user-123"
    });

    await first.waitForEvent("connected");
    await second.waitForEvent("connected");
    expect(sseManager.countConnectionsForUser("user-123")).toBe(2);

    const created = await postJson<Notification>(
      baseUrl,
      "/api/notifications",
      {
        userId: "user-123",
        type: "message",
        title: "Outra mensagem",
        message: "Duas conexoes devem receber."
      }
    );

    await first.waitForEvent(
      "notification",
      (candidate) => candidate.id === created.body.id
    );
    await second.waitForEvent(
      "notification",
      (candidate) => candidate.id === created.body.id
    );

    first.close();
    await waitUntil(() => sseManager.countConnectionsForUser("user-123") === 1);
    second.close();
  });

  it("recovers missed notifications using Last-Event-ID", async () => {
    const first = await service.create({
      userId: "user-123",
      type: "message",
      title: "Primeira",
      message: "Ja entregue."
    });
    const second = await service.create({
      userId: "user-123",
      type: "message",
      title: "Segunda",
      message: "Deve ser recuperada."
    });

    const stream = await openSse(baseUrl, "/api/notifications/stream", {
      "X-User-Id": "user-123",
      "Last-Event-ID": first.id
    });

    await stream.waitForEvent("connected");
    const recovered = await stream.waitForEvent(
      "notification",
      (candidate) => candidate.id === second.id
    );

    expect(recovered.data).toMatchObject({
      id: second.id,
      title: "Segunda"
    });

    stream.close();
  });

  it("removes the connection when the client disconnects", async () => {
    const stream = await openSse(baseUrl, "/api/notifications/stream", {
      "X-User-Id": "user-123"
    });

    await stream.waitForEvent("connected");
    expect(sseManager.countConnections()).toBe(1);

    stream.close();
    await waitUntil(() => sseManager.countConnections() === 0);
  });
});
