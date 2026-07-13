import { describe, expect, it } from "vitest";
import { connectionStatusLabel } from "./status";

describe("connectionStatusLabel", () => {
  it("converts connection status values to readable text", () => {
    expect(connectionStatusLabel("idle")).toBe("Nao conectado");
    expect(connectionStatusLabel("connecting")).toBe("Conectando");
    expect(connectionStatusLabel("connected")).toBe("Conectado");
    expect(connectionStatusLabel("reconnecting")).toBe("Reconectando");
    expect(connectionStatusLabel("disconnected")).toBe("Desconectado");
    expect(connectionStatusLabel("error")).toBe("Erro");
  });
});
