import { z } from "zod";

export const userIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:@-]+$/, "Use a simple user id");

export const notificationIdSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Notification id must be a numeric event id");

export const createNotificationSchema = z.object({
  userId: userIdSchema,
  type: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(2000),
  data: z.record(z.unknown()).nullable().optional()
});

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: notificationIdSchema.optional(),
  unreadOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true")
});

export type CreateNotificationBody = z.infer<
  typeof createNotificationSchema
>;

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
