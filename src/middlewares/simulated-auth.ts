import type { Request } from "express";
import { userIdSchema } from "../modules/notifications/notification.schema";

export function getSimulatedUserId(request: Request): string | null {
  const headerUserId = request.header("x-user-id");

  if (headerUserId) {
    const parsed = userIdSchema.safeParse(headerUserId);
    return parsed.success ? parsed.data : null;
  }

  const queryUserId = request.query.userId;

  if (typeof queryUserId === "string") {
    const parsed = userIdSchema.safeParse(queryUserId);
    return parsed.success ? parsed.data : null;
  }

  return null;
}
