import { ConnectionStatus } from "../ConnectionStatus/ConnectionStatus";
import type { ConnectionStatus as ConnectionStatusType } from "../../types/sse";
import { formatDateTime } from "../../utils/date";
import "./ConnectionPanel.css";

interface ConnectionPanelProps {
  userId: string;
  status: ConnectionStatusType;
  lastHeartbeatAt: string | null;
  lastEventId: string | null;
  unreadCount: number;
  onUserIdChange: (userId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

const activeStatuses: ConnectionStatusType[] = [
  "connecting",
  "connected",
  "reconnecting"
];

export function ConnectionPanel({
  userId,
  status,
  lastHeartbeatAt,
  lastEventId,
  unreadCount,
  onUserIdChange,
  onConnect,
  onDisconnect
}: ConnectionPanelProps) {
  const isActive = activeStatuses.includes(status);

  return (
    <section className="panel connection-panel" aria-labelledby="connection-title">
      <div className="panel__header">
        <div>
          <h2 id="connection-title">Conexao SSE</h2>
          <p>Abra um stream para receber notificacoes em tempo real.</p>
        </div>
        <ConnectionStatus status={status} />
      </div>

      <label className="field" htmlFor="user-id">
        Usuario
        <input
          id="user-id"
          value={userId}
          disabled={isActive}
          onChange={(event) => onUserIdChange(event.target.value)}
          autoComplete="off"
        />
      </label>

      <div className="connection-panel__actions">
        <button type="button" disabled={isActive || !userId.trim()} onClick={onConnect}>
          Conectar
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={!isActive}
          onClick={onDisconnect}
        >
          Desconectar
        </button>
      </div>

      <dl className="connection-panel__stats">
        <div>
          <dt>Ultimo heartbeat</dt>
          <dd>{lastHeartbeatAt ? formatDateTime(lastHeartbeatAt) : "Ainda nao recebido"}</dd>
        </div>
        <div>
          <dt>Ultimo evento</dt>
          <dd>{lastEventId ?? "Nenhum"}</dd>
        </div>
        <div>
          <dt>Nao lidas</dt>
          <dd>{unreadCount}</dd>
        </div>
      </dl>
    </section>
  );
}
