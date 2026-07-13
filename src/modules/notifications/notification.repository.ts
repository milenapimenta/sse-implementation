import type { Pool, QueryResultRow } from "pg";
import type {
  CreateNotificationInput,
  ListNotificationsInput,
  Notification
} from "./notification.types";

interface NotificationRow extends QueryResultRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read_at: Date | null;
  created_at: Date;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString()
  };
}

export class NotificationRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    const result = await this.pool.query<NotificationRow>(
      `
        insert into notifications (user_id, type, title, message, data)
        values ($1, $2, $3, $4, $5)
        returning id, user_id, type, title, message, data, read_at, created_at
      `,
      [
        input.userId,
        input.type,
        input.title,
        input.message,
        input.data ?? null
      ]
    );

    return toNotification(result.rows[0]);
  }

  async list(input: ListNotificationsInput): Promise<Notification[]> {
    const values: unknown[] = [input.userId, input.limit];
    const filters = ["user_id = $1"];

    if (input.cursor) {
      values.push(input.cursor);
      filters.push(`id < $${values.length}`);
    }

    if (input.unreadOnly) {
      filters.push("read_at is null");
    }

    const result = await this.pool.query<NotificationRow>(
      `
        select id, user_id, type, title, message, data, read_at, created_at
        from notifications
        where ${filters.join(" and ")}
        order by id desc
        limit $2
      `,
      values
    );

    return result.rows.map(toNotification);
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const result = await this.pool.query<NotificationRow>(
      `
        update notifications
        set read_at = coalesce(read_at, now())
        where id = $1 and user_id = $2
        returning id, user_id, type, title, message, data, read_at, created_at
      `,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return toNotification(result.rows[0]);
  }

  async findAfterIdForUser(
    userId: string,
    lastEventId: string,
    limit = 100
  ): Promise<Notification[]> {
    const result = await this.pool.query<NotificationRow>(
      `
        select id, user_id, type, title, message, data, read_at, created_at
        from notifications
        where user_id = $1 and id > $2
        order by id asc
        limit $3
      `,
      [userId, lastEventId, limit]
    );

    return result.rows.map(toNotification);
  }

  async countByUser(userId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "select count(*) from notifications where user_id = $1",
      [userId]
    );

    return Number(result.rows[0].count);
  }
}
