import type { Notification } from "../../types/notification";
import { formatDateTime } from "../../utils/date";
import "./NotificationCard.css";

interface NotificationCardProps {
  notification: Notification;
  marking: boolean;
  onMarkAsRead: (notificationId: string) => void;
}

export function NotificationCard({
  notification,
  marking,
  onMarkAsRead
}: NotificationCardProps) {
  const isUnread = notification.readAt === null;

  return (
    <article className={`notification-card ${isUnread ? "is-unread" : ""}`}>
      <div className="notification-card__content">
        <div className="notification-card__title-row">
          <h3>{notification.title}</h3>
          <span className="notification-card__state">
            {isUnread ? "Nao lida" : "Lida"}
          </span>
        </div>

        <p>{notification.message}</p>

        <dl className="notification-card__meta">
          <div>
            <dt>ID</dt>
            <dd>{notification.id}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{notification.type}</dd>
          </div>
          <div>
            <dt>Criada em</dt>
            <dd>{formatDateTime(notification.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <button
        type="button"
        className="button-secondary"
        disabled={!isUnread || marking}
        onClick={() => onMarkAsRead(notification.id)}
      >
        {marking ? "Marcando..." : "Marcar como lida"}
      </button>
    </article>
  );
}
