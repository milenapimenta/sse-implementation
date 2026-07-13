import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Notification } from "../../types/notification";
import { NotificationList } from "./NotificationList";

const notification: Notification = {
  id: "1",
  userId: "user-123",
  type: "message",
  title: "Nova mensagem",
  message: "Voce recebeu uma nova mensagem.",
  data: null,
  readAt: null,
  createdAt: "2026-01-01T12:00:00.000Z"
};

describe("NotificationList", () => {
  it("renders an empty state", () => {
    render(
      <NotificationList
        notifications={[]}
        filter="all"
        loading={false}
        error={null}
        markingIds={new Set()}
        onFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAsRead={vi.fn()}
      />
    );

    expect(screen.getByText(/Nenhuma notificacao/)).toBeInTheDocument();
  });

  it("renders notifications and marks as read", async () => {
    const user = userEvent.setup();
    const onMarkAsRead = vi.fn();

    render(
      <NotificationList
        notifications={[notification]}
        filter="all"
        loading={false}
        error={null}
        markingIds={new Set()}
        onFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onMarkAsRead={onMarkAsRead}
      />
    );

    expect(screen.getByText("Nova mensagem")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Marcar como lida" }));
    expect(onMarkAsRead).toHaveBeenCalledWith("1");
  });
});
