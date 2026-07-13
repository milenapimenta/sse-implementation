import { z } from "zod";
export declare const userIdSchema: z.ZodString;
export declare const notificationIdSchema: z.ZodString;
export declare const createNotificationSchema: z.ZodObject<{
    userId: z.ZodString;
    type: z.ZodString;
    title: z.ZodString;
    message: z.ZodString;
    data: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: string;
    userId: string;
    title: string;
    data?: Record<string, unknown> | null | undefined;
}, {
    message: string;
    type: string;
    userId: string;
    title: string;
    data?: Record<string, unknown> | null | undefined;
}>;
export declare const listNotificationsQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
    unreadOnly: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"true">, z.ZodLiteral<"false">, z.ZodBoolean]>>, boolean, boolean | "true" | "false" | undefined>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    unreadOnly: boolean;
    cursor?: string | undefined;
}, {
    limit?: number | undefined;
    cursor?: string | undefined;
    unreadOnly?: boolean | "true" | "false" | undefined;
}>;
export type CreateNotificationBody = z.infer<typeof createNotificationSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
