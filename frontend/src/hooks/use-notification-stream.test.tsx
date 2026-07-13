import { StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sseClient } from "../services/sse-client";
import type { Notification } from "../types/notification";
import { useNotificationStream } from "./use-notification-stream";

type Listener = (event: MessageEvent<string>) => void;

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  static instances: MockEventSource[] = [];

  readonly url: string;
  readyState = MockEventSource.CONNECTING;
  closeCalls = 0;
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
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
    this.closeCalls += 1;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  emit(type: string, data: unknown, lastEventId = ""): void {
    if (type === "open") {
      this.readyState = MockEventSource.OPEN;
    }

    const event = new MessageEvent<string>(type, {
      data: JSON.stringify(data),
      lastEventId
    });

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  emitError(readyState: number): void {
    this.readyState = readyState;
    const event = new MessageEvent<string>("error", { data: "" });

    for (const listener of this.listeners.get("error") ?? []) {
      listener(event);
    }
  }
}

describe("useNotificationStream", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    MockEventSource.instances = [];
    window.localStorage.clear();
    vi.stubGlobal("EventSource", MockEventSource);
    sseClient.disconnect("test-reset");
  });

  afterEach(() => {
    cleanup();
    sseClient.disconnect("test-cleanup");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates one connection and registers listeners", () => {
    const onNotification = vi.fn();
    const { result } = renderHook(() =>
      useNotificationStream({ userId: "user-123", onNotification })
    );

    act(() => result.current.connect());
    act(() => result.current.connect());

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("userId=user-123");
    expect(MockEventSource.instances[0].listenerCount("notification")).toBe(1);
  });

  it("processes connected, notification and ping events", () => {
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
    const onNotification = vi.fn();
    const onStreamEvent = vi.fn();
    const { result } = renderHook(() =>
      useNotificationStream({
        userId: "user-123",
        onNotification,
        onStreamEvent
      })
    );

    act(() => result.current.connect());
    const source = MockEventSource.instances[0];

    act(() => source.emit("connected", { connected: true }));
    expect(result.current.status).toBe("connected");

    act(() => source.emit("notification", notification, "10"));
    expect(onNotification).toHaveBeenCalledWith(notification);
    expect(result.current.lastEventId).toBe("10");

    act(() => source.emit("ping", { timestamp: "2026-01-01T12:01:00.000Z" }));
    expect(result.current.lastHeartbeatAt).toBe("2026-01-01T12:01:00.000Z");
    expect(onStreamEvent).toHaveBeenCalled();
  });

  it("shows reconnecting when EventSource reports a transient error", () => {
    const { result } = renderHook(() =>
      useNotificationStream({ userId: "user-123", onNotification: vi.fn() })
    );

    act(() => result.current.connect());
    act(() => MockEventSource.instances[0].emitError(MockEventSource.CONNECTING));

    expect(result.current.status).toBe("reconnecting");
  });

  it("closes manually and cleans up on unmount", async () => {
    const { result, unmount } = renderHook(() =>
      useNotificationStream({ userId: "user-123", onNotification: vi.fn() })
    );

    act(() => result.current.connect());
    const source = MockEventSource.instances[0];

    act(() => result.current.disconnect());
    expect(source.closeCalls).toBe(1);
    expect(result.current.status).toBe("disconnected");

    act(() => result.current.connect());
    const secondSource = MockEventSource.instances[1];
    unmount();
    await act(() => Promise.resolve());
    expect(secondSource.closeCalls).toBe(1);
  });

  it("keeps a single connection under React Strict Mode", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result } = renderHook(
      () =>
        useNotificationStream({
          userId: "user-123",
          onNotification: vi.fn()
        }),
      { wrapper }
    );

    act(() => result.current.connect());
    act(() => result.current.connect());

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].listenerCount("notification")).toBe(1);
  });

  it("reuses the same connection during Strict Mode effect replay", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <StrictMode>{children}</StrictMode>
    );

    renderHook(
      () =>
        useNotificationStream({
          userId: "user-123",
          enabled: true,
          onNotification: vi.fn()
        }),
      { wrapper }
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].closeCalls).toBe(0);
    expect(MockEventSource.instances[0].listenerCount("notification")).toBe(1);
  });

  it("closes the old stream when the user changes", () => {
    const { result, rerender } = renderHook(
      ({ userId }) =>
        useNotificationStream({ userId, onNotification: vi.fn() }),
      { initialProps: { userId: "user-123" } }
    );
    act(() => result.current.connect());
    const first = MockEventSource.instances[0];

    rerender({ userId: "user-456" });

    expect(first.closeCalls).toBe(1);
    expect(result.current.status).toBe("idle");
    expect(result.current.lastEventId).toBeNull();
    expect(result.current.lastHeartbeatAt).toBeNull();
  });
});
