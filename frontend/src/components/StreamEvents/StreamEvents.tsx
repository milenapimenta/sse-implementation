import type { StreamLog } from "../../types/sse";
import { formatDateTime } from "../../utils/date";
import "./StreamEvents.css";

interface StreamEventsProps {
  events: StreamLog[];
}

export function StreamEvents({ events }: StreamEventsProps) {
  return (
    <section className="panel stream-events" aria-labelledby="events-title">
      <div className="panel__header">
        <div>
          <h2 id="events-title">Eventos do stream</h2>
          <p>Ultimos 50 eventos de diagnostico.</p>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="muted-message">Nenhum evento registrado.</p>
      ) : (
        <ol className="stream-events__list">
          {events.map((event) => (
            <li key={event.id} className={`stream-events__item type-${event.type}`}>
              <span>{event.type}</span>
              <time dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
              <p>{event.message}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
