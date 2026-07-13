import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionStatus } from "./ConnectionStatus";

describe("ConnectionStatus", () => {
  it("renders a readable status label", () => {
    render(<ConnectionStatus status="reconnecting" />);

    expect(screen.getByText("Reconectando")).toBeInTheDocument();
  });
});
