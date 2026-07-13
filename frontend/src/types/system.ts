export interface HealthStatus {
  api: string;
  postgres: string;
  redis: string;
}

export interface Metrics {
  sseConnections: number;
  connectedUsers: number;
}

export interface SystemSnapshot {
  health: HealthStatus;
  metrics: Metrics;
}
