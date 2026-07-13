import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

const createdPools: FakePool[] = [];

class FakePool extends EventEmitter {
  readonly options: unknown;
  readonly queries: string[] = [];
  endCalls = 0;
  connectCalls = 0;
  totalCount = 3;
  idleCount = 2;
  waitingCount = 1;

  constructor(options: unknown) {
    super();
    this.options = options;
    createdPools.push(this);
  }

  async query(sql: string): Promise<{ rows: unknown[]; rowCount: number }> {
    this.queries.push(sql);
    return { rows: [], rowCount: 0 };
  }

  async end(): Promise<void> {
    this.endCalls += 1;
  }

  async connect(): Promise<{
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  }> {
    this.connectCalls += 1;
    return {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: vi.fn()
    };
  }
}

vi.mock("pg", () => ({
  Pool: FakePool
}));

const config = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
  DATABASE_POOL_MAX: 7,
  DATABASE_IDLE_TIMEOUT_MS: 1234,
  DATABASE_CONNECTION_TIMEOUT_MS: 500
};

async function loadPostgresModule() {
  vi.resetModules();
  createdPools.length = 0;
  return import("../database/postgres");
}

describe("PostgreSQL singleton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the same pool instance and installs listeners once", async () => {
    const postgres = await loadPostgresModule();

    const first = postgres.getPostgresPool({ env: config });
    const second = postgres.getPostgresPool({ env: config });

    expect(second).toBe(first);
    expect(createdPools).toHaveLength(1);
    expect(createdPools[0].options).toMatchObject({
      connectionString: config.DATABASE_URL,
      max: config.DATABASE_POOL_MAX,
      idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS
    });
    expect(createdPools[0].listenerCount("connect")).toBe(1);
    expect(createdPools[0].listenerCount("error")).toBe(1);
  });

  it("lets repositories share the same pool injected by composition", async () => {
    const postgres = await loadPostgresModule();
    const { NotificationRepository } = await import(
      "../modules/notifications/notification.repository"
    );

    const repositoryA = new NotificationRepository(
      postgres.getPostgresPool({ env: config })
    );
    const repositoryB = new NotificationRepository(
      postgres.getPostgresPool({ env: config })
    );

    expect((repositoryA as unknown as { pool: Pool }).pool).toBe(
      (repositoryB as unknown as { pool: Pool }).pool
    );
    expect(createdPools).toHaveLength(1);
  });

  it("health checks use pool.query without acquiring a dedicated client", async () => {
    const postgres = await loadPostgresModule();
    const pool = postgres.getPostgresPool({ env: config });
    const fakePool = pool as unknown as FakePool;

    await postgres.checkPostgres(pool, 100);

    expect(fakePool.queries).toEqual(["select 1"]);
    expect(fakePool.connectCalls).toBe(0);
    expect(createdPools).toHaveLength(1);
  });

  it("reports pool metrics without creating another pool", async () => {
    const postgres = await loadPostgresModule();

    postgres.getPostgresPool({ env: config });

    expect(postgres.getPostgresPoolMetrics()).toEqual({
      totalConnections: 3,
      idleConnections: 2,
      waitingRequests: 1
    });
    expect(createdPools).toHaveLength(1);
  });

  it("closes the pool only once and blocks reuse during shutdown", async () => {
    const postgres = await loadPostgresModule();
    const pool = postgres.getPostgresPool({ env: config });
    const fakePool = pool as unknown as FakePool;

    await Promise.all([
      postgres.closePostgresPool(),
      postgres.closePostgresPool()
    ]);
    await postgres.closePostgresPool();

    expect(fakePool.endCalls).toBe(1);
    expect(() => postgres.getPostgresPool({ env: config })).toThrow(
      /shutting down/
    );
  });
});

describe("PostgreSQL migrations", () => {
  it("uses one checked-out client per migration transaction and releases it", async () => {
    vi.resetModules();
    const { runMigrations } = await import("../database/migrate");
    const migrationsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "sse-migrations-")
    );
    await fs.writeFile(
      path.join(migrationsDir, "001_test.sql"),
      "create table example(id int);"
    );

    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: vi.fn()
    };
    const pool = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      connect: vi.fn(async () => client)
    };

    await runMigrations(pool as unknown as Pool, migrationsDir);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenNthCalledWith(1, "begin");
    expect(client.query).toHaveBeenCalledWith("commit");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
