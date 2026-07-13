import type {
  Notification,
  NotificationFilter
} from "../../types/notification";
import { NotificationCard } from "../NotificationCard/NotificationCard";
import "./NotificationList.css";

interface NotificationListProps {
  notifications: Notification[];
  filter: NotificationFilter;
  loading: boolean;
  error: string | null;
  markingIds: Set<string>;
  onFilterChange: (filter: NotificationFilter) => void;
  onRefresh: () => void;
  onMarkAsRead: (notificationId: string) => void;
}

export function NotificationList({
  notifications,
  filter,
  loading,
  error,
  markingIds,
  onFilterChange,
  onRefresh,
  onMarkAsRead
}: NotificationListProps) {
  return (
    <section className="panel notification-list" aria-labelledby="notifications-title">
      <div className="panel__header notification-list__header">
        <div>
          <h2 id="notifications-title">Notificacoes</h2>
          <p>Persistidas no PostgreSQL e atualizadas pelo stream.</p>
        </div>

        <button type="button" className="button-secondary" onClick={onRefresh}>
          Atualizar lista
        </button>
      </div>

      <div className="notification-list__filters" aria-label="Filtro de notificacoes">
        <button
          type="button"
          className={filter === "all" ? "is-selected" : ""}
          onClick={() => onFilterChange("all")}
        >
          Todas
        </button>
        <button
          type="button"
          className={filter === "unread" ? "is-selected" : ""}
          onClick={() => onFilterChange("unread")}
        >
          Nao lidas
        </button>
      </div>

      <div aria-live="polite">
        {loading && <p className="muted-message">Carregando notificacoes...</p>}
        {error && <p className="error-message">{error}</p>}
      </div>

      {notifications.length === 0 && !loading ? (
        <div className="empty-state">
          <strong>Nenhuma notificacao por aqui.</strong>
          <p>Conecte ao stream ou crie uma notificacao para este usuario.</p>
        </div>
      ) : (
        <div className="notification-list__items">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              marking={markingIds.has(notification.id)}
              onMarkAsRead={onMarkAsRead}
            />
          ))}
        </div>
      )}
    </section>
  );
}
