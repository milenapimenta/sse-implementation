import type { Notification } from "../types/notification";
import type {
  ConnectedEventData,
  PingEventData,
  SseClientContract,
  SseConnectOptions,
  SseConnectionStatus,
  SseSubscriber
} from "../types/sse";

interface RegisteredSubscriber extends SseSubscriber {
  id: string;
}

interface EventSourceListeners {
  open: EventListener;
  connected: EventListener;
  notification: EventListener;
  ping: EventListener;
  error: EventListener;
}

interface ResumeTarget {
  url: string;
  userId: string;
}

function parseMessageData<T>(event: Event): T {
  return JSON.parse((event as MessageEvent<string>).data) as T;
}

export class SseClient implements SseClientContract {
  private static instance: SseClient | null = null;

  private eventSource: EventSource | null = null;
  private listeners: EventSourceListeners | null = null;
  private readonly subscribers = new Map<string, RegisteredSubscriber>();
  private currentUserId: string | null = null;
  private currentUrl: string | null = null;
  private status: SseConnectionStatus = "idle";
  private connectionGeneration = 0;
  private connectionSequence = 0;
  private subscriberSequence = 0;
  private currentConnectionId: string | null = null;
  private resumeTarget: ResumeTarget | null = null;

  private constructor() {
    window.addEventListener("pagehide", this.handlePageHide);
    window.addEventListener("beforeunload", this.handleBeforeUnload);
    window.addEventListener("pageshow", this.handlePageShow);
  }

  static getInstance(): SseClient {
    SseClient.instance ??= new SseClient();
    return SseClient.instance;
  }

  connect(options: SseConnectOptions): void {
    const userId = options.userId.trim();
    const url = options.url.trim();

    if (!userId || !url) {
      this.setStatus("error");
      this.notifyError("Usuario e URL do stream sao obrigatorios.");
      return;
    }

    if (
      this.eventSource &&
      this.currentUserId === userId &&
      this.currentUrl === url &&
      this.eventSource.readyState !== EventSource.CLOSED
    ) {
      this.log("connection reused", { userId });
      this.notifyStatusToTarget(this.status, userId, url);
      return;
    }

    if (this.eventSource) {
      this.disconnectInternal("connection-replaced", false);
    }

    const generation = ++this.connectionGeneration;
    const connectionId = `connection-${++this.connectionSequence}`;
    const source = new EventSource(url);

    this.eventSource = source;
    this.currentUserId = userId;
    this.currentUrl = url;
    this.currentConnectionId = connectionId;
    this.resumeTarget = null;
    this.setStatus("connecting", userId, url);
    this.log("connecting", { connectionId, userId });

    const isCurrent = () =>
      this.eventSource === source &&
      this.connectionGeneration === generation &&
      this.currentConnectionId === connectionId;

    const open: EventListener = () => {
      if (!isCurrent()) return;
      this.setStatus("connected", userId, url);
      this.log("connected", { connectionId, userId });
    };

    const connected: EventListener = (event) => {
      if (!isCurrent()) return;

      try {
        const data = parseMessageData<ConnectedEventData>(event);
        this.setStatus(data.connected ? "connected" : "connecting", userId, url);
        this.forTarget(userId, url, (subscriber) => subscriber.onConnected?.());
      } catch {
        this.notifyError("Evento connected invalido.", userId, url);
      }
    };

    const notification: EventListener = (event) => {
      if (!isCurrent()) return;

      try {
        const messageEvent = event as MessageEvent<string>;
        const data = parseMessageData<Notification>(event);
        this.forTarget(userId, url, (subscriber) =>
          subscriber.onNotification?.(data, messageEvent.lastEventId)
        );
      } catch {
        this.notifyError("Evento notification invalido.", userId, url);
      }
    };

    const ping: EventListener = (event) => {
      if (!isCurrent()) return;

      try {
        const data = parseMessageData<PingEventData>(event);
        this.forTarget(userId, url, (subscriber) =>
          subscriber.onPing?.(data.timestamp)
        );
      } catch {
        this.notifyError("Evento ping invalido.", userId, url);
      }
    };

    const error: EventListener = () => {
      if (!isCurrent()) return;

      if (source.readyState === EventSource.CONNECTING) {
        this.setStatus("reconnecting", userId, url);
        this.notifyError(
          "Conexao perdida. O navegador tentara reconectar.",
          userId,
          url
        );
        this.log("reconnecting", { connectionId, userId });
        return;
      }

      if (source.readyState === EventSource.CLOSED) {
        this.setStatus("error", userId, url);
        this.notifyError("Stream fechado com erro.", userId, url);
      }
    };

    this.listeners = { open, connected, notification, ping, error };
    source.addEventListener("open", open);
    source.addEventListener("connected", connected);
    source.addEventListener("notification", notification);
    source.addEventListener("ping", ping);
    source.addEventListener("error", error);
  }

  disconnect(reason = "manual"): void {
    this.resumeTarget = null;
    this.disconnectInternal(reason, false);
  }

  subscribe(subscriber: SseSubscriber): () => void {
    const registered: RegisteredSubscriber = {
      ...subscriber,
      userId: subscriber.userId.trim(),
      url: subscriber.url.trim(),
      id: `subscriber-${++this.subscriberSequence}`
    };

    this.subscribers.set(registered.id, registered);
    this.log("subscriber added", {
      userId: registered.userId,
      subscribers: this.subscribers.size
    });

    if (
      this.currentUserId &&
      this.currentUrl &&
      !this.hasSubscribersFor(this.currentUserId, this.currentUrl)
    ) {
      this.disconnect("subscriber-target-changed");
    }

    if (this.matchesCurrentTarget(registered)) {
      this.invoke(() => registered.onStatusChange?.(this.status));
    }

    let subscribed = true;

    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.subscribers.delete(registered.id);
      this.log("subscriber removed", {
        userId: registered.userId,
        subscribers: this.subscribers.size
      });

      if (
        this.currentUserId &&
        this.currentUrl &&
        !this.hasSubscribersFor(this.currentUserId, this.currentUrl)
      ) {
        this.disconnectIfStillUnused();
      }
    };
  }

  isConnected(): boolean {
    return Boolean(
      this.eventSource && this.eventSource.readyState !== EventSource.CLOSED
    );
  }

  getStatus(): SseConnectionStatus {
    return this.status;
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  private disconnectInternal(reason: string, preserveResumeTarget: boolean): void {
    ++this.connectionGeneration;
    const source = this.eventSource;
    const listeners = this.listeners;
    const userId = this.currentUserId;
    const url = this.currentUrl;
    const connectionId = this.currentConnectionId;

    this.log("disconnecting", {
      connectionId,
      userId,
      reason,
      subscribers: this.subscribers.size
    });

    if (source && listeners) {
      this.removeListeners(source, listeners);
    }

    source?.close();
    this.eventSource = null;
    this.listeners = null;
    this.currentUserId = null;
    this.currentUrl = null;
    this.currentConnectionId = null;

    if (!preserveResumeTarget) {
      this.resumeTarget = null;
    }

    this.setStatus("disconnected", userId ?? undefined, url ?? undefined);
    this.log("disconnected", { connectionId, userId, reason });
  }

  private removeListeners(
    source: EventSource,
    listeners: EventSourceListeners
  ): void {
    source.removeEventListener("open", listeners.open);
    source.removeEventListener("connected", listeners.connected);
    source.removeEventListener("notification", listeners.notification);
    source.removeEventListener("ping", listeners.ping);
    source.removeEventListener("error", listeners.error);
  }

  private setStatus(
    status: SseConnectionStatus,
    userId = this.currentUserId ?? undefined,
    url = this.currentUrl ?? undefined
  ): void {
    this.status = status;

    if (userId && url) {
      this.notifyStatusToTarget(status, userId, url);
    }
  }

  private notifyStatusToTarget(
    status: SseConnectionStatus,
    userId: string,
    url: string
  ): void {
    this.forTarget(userId, url, (subscriber) =>
      subscriber.onStatusChange?.(status)
    );
  }

  private notifyError(
    message: string,
    userId = this.currentUserId ?? undefined,
    url = this.currentUrl ?? undefined
  ): void {
    if (!userId || !url) return;
    this.forTarget(userId, url, (subscriber) => subscriber.onError?.(message));
  }

  private forTarget(
    userId: string,
    url: string,
    callback: (subscriber: RegisteredSubscriber) => void
  ): void {
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.userId === userId && subscriber.url === url) {
        this.invoke(() => callback(subscriber));
      }
    }
  }

  private hasSubscribersFor(userId: string, url: string): boolean {
    return [...this.subscribers.values()].some(
      (subscriber) => subscriber.userId === userId && subscriber.url === url
    );
  }

  private matchesCurrentTarget(subscriber: RegisteredSubscriber): boolean {
    return (
      subscriber.userId === this.currentUserId && subscriber.url === this.currentUrl
    );
  }

  private disconnectIfStillUnused(): void {
    const source = this.eventSource;
    const generation = this.connectionGeneration;
    const userId = this.currentUserId;
    const url = this.currentUrl;

    if (!source || !userId || !url) return;

    queueMicrotask(() => {
      if (
        this.eventSource === source &&
        this.connectionGeneration === generation &&
        this.currentUserId === userId &&
        this.currentUrl === url &&
        !this.hasSubscribersFor(userId, url)
      ) {
        this.disconnect("no-subscribers");
      }
    });
  }

  private invoke(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.log("subscriber callback failed", {
        error: error instanceof Error ? error.message : "unknown error"
      });
    }
  }

  private readonly handlePageHide = () => {
    this.log("pagehide", {
      connectionId: this.currentConnectionId,
      userId: this.currentUserId
    });

    if (this.eventSource && this.currentUserId && this.currentUrl) {
      this.resumeTarget = {
        userId: this.currentUserId,
        url: this.currentUrl
      };
    }

    this.disconnectInternal("pagehide", true);
  };

  private readonly handleBeforeUnload = () => {
    this.disconnect("beforeunload");
  };

  private readonly handlePageShow = (event: PageTransitionEvent) => {
    const target = this.resumeTarget;

    if (
      !event.persisted ||
      !target ||
      this.eventSource ||
      !this.hasSubscribersFor(target.userId, target.url)
    ) {
      return;
    }

    this.resumeTarget = null;
    this.connect(target);
  };

  private log(message: string, context: Record<string, unknown>): void {
    if (import.meta.env.DEV) {
      console.info(`[SSE] ${message}`, {
        connectionId: this.currentConnectionId,
        userId: this.currentUserId,
        subscribers: this.subscribers.size,
        ...context
      });
    }
  }
}

export const sseClient = SseClient.getInstance();
