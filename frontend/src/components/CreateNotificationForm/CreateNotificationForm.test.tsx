import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Notification } from "../../types/notification";
import { CreateNotificationForm } from "./CreateNotificationForm";

const createdNotification: Notification = {
  id: "1",
  userId: "user-123",
  type: "message",
  title: "Nova mensagem",
  message: "Voce recebeu uma nova mensagem.",
  data: { source: "frontend" },
  readAt: null,
  createdAt: "2026-01-01T12:00:00.000Z"
};

vi.mock("../../api/notifications-api", () => ({
  createNotification: vi.fn(async () => createdNotification)
}));

describe("CreateNotificationForm", () => {
  it("validates required fields", async () => {
    const user = userEvent.setup();

    render(
      <CreateNotificationForm
        defaultUserId="user-123"
        streamConnected={false}
        onCreatedWhileDisconnected={vi.fn()}
      />
    );

    await user.clear(screen.getByLabelText("Titulo"));
    await user.click(screen.getByRole("button", { name: "Enviar notificacao" }));

    expect(screen.getByText(/Preencha usuario/)).toBeInTheDocument();
  });

  it("submits and updates the list when disconnected", async () => {
    const user = userEvent.setup();
    const onCreatedWhileDisconnected = vi.fn();

    render(
      <CreateNotificationForm
        defaultUserId="user-123"
        streamConnected={false}
        onCreatedWhileDisconnected={onCreatedWhileDisconnected}
      />
    );

    await user.click(screen.getByRole("button", { name: "Enviar notificacao" }));

    await waitFor(() => {
      expect(onCreatedWhileDisconnected).toHaveBeenCalledWith(createdNotification);
    });
    expect(screen.getByText(/lista atualizada/)).toBeInTheDocument();
  });
});
