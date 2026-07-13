import type { SseEvent } from "./sse.types";

function appendField(lines: string[], field: string, value: string): void {
  for (const line of value.split(/\r?\n/)) {
    lines.push(`${field}: ${line}`);
  }
}

export function formatSseEvent(event: SseEvent): string {
  const lines: string[] = [];

  if (event.comment !== undefined) {
    for (const line of event.comment.split(/\r?\n/)) {
      lines.push(`: ${line}`);
    }
  }

  if (event.retry !== undefined) {
    lines.push(`retry: ${event.retry}`);
  }

  if (event.id !== undefined) {
    appendField(lines, "id", event.id);
  }

  if (event.event !== undefined) {
    appendField(lines, "event", event.event);
  }

  if (event.data !== undefined) {
    const data =
      typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    appendField(lines, "data", data);
  }

  return `${lines.join("\n")}\n\n`;
}
