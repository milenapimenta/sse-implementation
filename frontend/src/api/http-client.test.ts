import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./http-client";

describe("request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses successful JSON responses", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(request<{ ok: boolean }>("/health")).resolves.toEqual({
      ok: true
    });
  });

  it("throws a descriptive API error", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Payload invalido" } }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    await expect(request("/api/notifications")).rejects.toThrow("Payload invalido");
  });

  it("throws a descriptive network error", async () => {
    vi.spyOn(window, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(request("/health")).rejects.toThrow(
      "Nao foi possivel conectar a API"
    );
  });
});
