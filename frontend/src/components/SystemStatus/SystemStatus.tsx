import type { SystemSnapshot } from "../../types/system";
import "./SystemStatus.css";

interface SystemStatusProps {
  snapshot: SystemSnapshot | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function SystemStatus({
  snapshot,
  loading,
  error,
  onRefresh
}: SystemStatusProps) {
  return (
    <section className="panel system-status" aria-labelledby="system-title">
      <div className="panel__header">
        <div>
          <h2 id="system-title">Status da API</h2>
          <p>Health check e metricas sob demanda.</p>
        </div>

        <button
          type="button"
          className="button-secondary"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div aria-live="polite">
        {error && <p className="error-message">{error}</p>}
      </div>

      <dl className="system-status__grid">
        <div>
          <dt>API</dt>
          <dd>{snapshot?.health.api ?? "desconhecido"}</dd>
        </div>
        <div>
          <dt>PostgreSQL</dt>
          <dd>{snapshot?.health.postgres ?? "desconhecido"}</dd>
        </div>
        <div>
          <dt>Redis</dt>
          <dd>{snapshot?.health.redis ?? "desconhecido"}</dd>
        </div>
        <div>
          <dt>Conexoes SSE</dt>
          <dd>{snapshot?.metrics.sseConnections ?? 0}</dd>
        </div>
        <div>
          <dt>Usuarios conectados</dt>
          <dd>{snapshot?.metrics.connectedUsers ?? 0}</dd>
        </div>
      </dl>
    </section>
  );
}
