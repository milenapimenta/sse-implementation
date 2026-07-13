import { describe, expect, it } from "vitest";
import { formatSseEvent } from "../sse/sse-format";

describe("formatSseEvent", () => {
  it("formats a notification event using the official SSE fields", () => {
    const formatted = formatSseEvent({
      id: "42",
      event: "notification",
      data: { id: "42", title: "Nova mensagem" }
    });

    expect(formatted).toBe(
      'id: 42\nevent: notification\ndata: {"id":"42","title":"Nova mensagem"}\n\n'
    );
  });

  it("formats retry instructions", () => {
    expect(formatSseEvent({ retry: 3000 })).toBe("retry: 3000\n\n");
  });

  it("formats multiline data safely", () => {
    expect(
      formatSseEvent({
        event: "debug",
        data: "line 1\nline 2"
      })
    ).toBe("event: debug\ndata: line 1\ndata: line 2\n\n");
  });
});
