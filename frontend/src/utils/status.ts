import type { ConnectionStatus } from "../types/sse";

const labels: Record<ConnectionStatus, string> = {
  idle: "Nao conectado",
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  disconnected: "Desconectado",
  error: "Erro"
};

export function connectionStatusLabel(status: ConnectionStatus): string {
  return labels[status];
}
