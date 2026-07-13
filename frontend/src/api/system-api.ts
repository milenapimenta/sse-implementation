import type { HealthStatus, Metrics, SystemSnapshot } from "../types/system";
import { request } from "./http-client";

export async function getHealth(): Promise<HealthStatus> {
  return request<HealthStatus>("/health");
}

export async function getMetrics(): Promise<Metrics> {
  return request<Metrics>("/metrics");
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const [health, metrics] = await Promise.all([getHealth(), getMetrics()]);
  return { health, metrics };
}
