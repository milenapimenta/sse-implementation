import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Notification } from "../types/notification";
import { SseClient, sseClient } from "./sse-client";

type Listener = EventListener;

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  readonly url: string;
  readyState = MockEventSource.CONNECTING;
  closeCalls = 0;
  removeCalls = 0;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
    this.removeCalls += 1;
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
    this.closeCalls += 1;
  }

  emit(type: string, data: unknown, lastEventId = ""): void {
    if (type === "open") this.readyState = MockEventSource.OPEN;
    const event = new MessageEvent<string>(type, {
      data: JSON.stringify(data),
      lastEventId
    });

    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }

  emitError(readyState: number): void {
    this.readyState = readyState;
    const event = new Event("error");

    for (const listener of [...(this.listeners.get("error") ?? [])]) {
      listener(event);
    }
  }

  getListener(type: string): Listener {
    const listener = this.listeners.get(type)?.values().next().value;
    if (!listener) throw new Error(`Listener ${type} nao encontrado`);
    return listener;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const url123 = "http://localhost:3000/api/notifications/stream?userId=user-123";
const url456 = "http://localhost:3000/api/notifications/stream?userId=user-456";
const notification: Notification = {
  id: "10",
  userId: "user-123",
  type: "message",
  title: "Nova mensagem",
  message: "Voce recebeu uma nova mensagem.",
  data: null,
  readAt: null,
  createdAt: "2026-01-01T12:00:00.000Z"
};

describe("SseClient singleton", () => {
  const unsubscribers: Array<() => void> = [];

  function subscribe(
    userId = "user-123",
    url = url123,
    callbacks: Parameters<typeof sseClient.subscribe>[0] = { userId, url }
  ) {
    const unsubscribe = sseClient.subscribe({ ...callbacks, userId, url });
    unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
    sseClient.disconnect("test-reset");
  });

  afterEach(() => {
    while (unsubscribers.length > 0) unsubscribers.pop()?.();
    sseClient.disconnect("test-cleanup");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("always returns the same manager instance", () => {
    expect(SseClient.getInstance()).toBe(SseClient.getInstance());
    expect(SseClient.getInstance()).toBe(sseClient);
  });

  it("reuses one EventSource for repeated connects to the same target", () => {
    subscribe();

    sseClient.connect({ userId: "user-123", url: url123 });
    sseClient.connect({ userId: "user-123", url: url123 });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(sseClient.getCurrentUserId()).toBe("user-123");
    expect(console.info).toHaveBeenCalledWith(
      "[SSE] connection reused",
      expect.objectContaining({ userId: "user-123" })
    );
  });

  it("closes the previous source before connecting another user", () => {
    subscribe();
    subscribe("user-456", url456);
    sseClient.connect({ userId: "user-123", url: url123 });
    const first = MockEventSource.instances[0];

    sseClient.connect({ userId: "user-456", url: url456 });

    expect(first.closeCalls).toBe(1);
    expect(first.listenerCount("notification")).toBe(0);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(sseClient.getCurrentUserId()).toBe("user-456");
  });

  it("disconnects idempotently and removes every listener", () => {
    subscribe();
    sseClient.connect({ userId: "user-123", url: url123 });
    const source = MockEventSource.instances[0];

    sseClient.disconnect("logout");
    sseClient.disconnect("logout");
    sseClient.disconnect("logout");

    expect(source.closeCalls).toBe(1);
    expect(source.removeCalls).toBe(5);
    expect(sseClient.isConnected()).toBe(false);
    expect(sseClient.getStatus()).toBe("disconnected");
    expect(sseClient.getCurrentUserId()).toBeNull();
  });

  it("ignores callbacks captured from a replaced connection", () => {
    const oldNotification = vi.fn();
    const newNotification = vi.fn();
    subscribe("user-123", url123, {
      userId: "user-123",
      url: url123,
      onNotification: oldNotification
    });
    subscribe("user-456", url456, {
      userId: "user-456",
      url: url456,
      onNotification: newNotification
    });
    sseClient.connect({ userId: "user-123", url: url123 });
    const staleCallback = MockEventSource.instances[0].getListener("notification");

    sseClient.connect({ userId: "user-456", url: url456 });
    staleCallback(
      new MessageEvent("notification", {
        data: JSON.stringify(notification),
        lastEventId: "10"
      })
    );

    expect(oldNotification).not.toHaveBeenCalled();
    expect(newNotification).not.toHaveBeenCalled();
  });

  it("uses native reconnection without creating another EventSource", () => {
    const statuses: string[] = [];
    subscribe("user-123", url123, {
      userId: "user-123",
      url: url123,
      onStatusChange: (status) => statuses.push(status)
    });
    sseClient.connect({ userId: "user-123", url: url123 });

    MockEventSource.instances[0].emitError(MockEventSource.CONNECTING);

    expect(statuses).toContain("reconnecting");
    expect(sseClient.getStatus()).toBe("reconnecting");
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("closes only after the last subscriber for the active target leaves", async () => {
    const firstUnsubscribe = subscribe();
    const secondUnsubscribe = subscribe();
    sseClient.connect({ userId: "user-123", url: url123 });
    const source = MockEventSource.instances[0];

    firstUnsubscribe();
    expect(source.closeCalls).toBe(0);

    secondUnsubscribe();
    await Promise.resolve();
    expect(source.closeCalls).toBe(1);
  });

  it("does not deliver events to a removed subscriber", () => {
    const removedCallback = vi.fn();
    const activeCallback = vi.fn();
    const unsubscribe = subscribe("user-123", url123, {
      userId: "user-123",
      url: url123,
      onNotification: removedCallback
    });
    subscribe("user-123", url123, {
      userId: "user-123",
      url: url123,
      onNotification: activeCallback
    });
    sseClient.connect({ userId: "user-123", url: url123 });

    unsubscribe();
    MockEventSource.instances[0].emit("notification", notification, "10");

    expect(removedCallback).not.toHaveBeenCalled();
    expect(activeCallback).toHaveBeenCalledWith(notification, "10");
  });

  it("disconnects synchronously on pagehide and beforeunload", () => {
    subscribe();
    sseClient.connect({ userId: "user-123", url: url123 });
    const pageHideSource = MockEventSource.instances[0];

    window.dispatchEvent(new Event("pagehide"));
    expect(pageHideSource.closeCalls).toBe(1);

    sseClient.connect({ userId: "user-123", url: url123 });
    const unloadSource = MockEventSource.instances[1];
    window.dispatchEvent(new Event("beforeunload"));
    expect(unloadSource.closeCalls).toBe(1);
  });

  it("resumes once from bfcache only when a subscriber is still mounted", () => {
    subscribe();
    sseClient.connect({ userId: "user-123", url: url123 });
    window.dispatchEvent(new Event("pagehide"));

    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));

    expect(MockEventSource.instances).toHaveLength(2);
    expect(sseClient.isConnected()).toBe(true);
  });

  it("prevents an old error callback from changing the new status", () => {
    const newStatuses: string[] = [];
    subscribe();
    subscribe("user-456", url456, {
      userId: "user-456",
      url: url456,
      onStatusChange: (status) => newStatuses.push(status)
    });
    sseClient.connect({ userId: "user-123", url: url123 });
    const staleError = MockEventSource.instances[0].getListener("error");
    sseClient.connect({ userId: "user-456", url: url456 });

    staleError(new Event("error"));

    expect(sseClient.getStatus()).toBe("connecting");
    expect(newStatuses.at(-1)).toBe("connecting");
  });
});
