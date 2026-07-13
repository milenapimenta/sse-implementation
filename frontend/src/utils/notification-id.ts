import type { Notification } from "../types/notification";

function compareNumericIdsDesc(a: string, b: string): number {
  try {
    const left = BigInt(a);
    const right = BigInt(b);

    if (left === right) {
      return 0;
    }

    return left > right ? -1 : 1;
  } catch {
    return b.localeCompare(a);
  }
}

export function compareNotificationsDesc(
  left: Notification,
  right: Notification
): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return compareNumericIdsDesc(left.id, right.id);
}

export function mergeNotificationsById(
  current: Notification[],
  incoming: Notification[]
): Notification[] {
  const byId = new Map<string, Notification>();

  for (const notification of current) {
    byId.set(notification.id, notification);
  }

  for (const notification of incoming) {
    const existing = byId.get(notification.id);
    byId.set(notification.id, existing ? { ...existing, ...notification } : notification);
  }

  return [...byId.values()].sort(compareNotificationsDesc);
}

export function upsertNotification(
  current: Notification[],
  notification: Notification
): Notification[] {
  return mergeNotificationsById(current, [notification]);
}
