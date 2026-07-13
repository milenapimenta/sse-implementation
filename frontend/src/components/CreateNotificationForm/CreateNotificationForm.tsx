import { FormEvent, useEffect, useState } from "react";
import { createNotification } from "../../api/notifications-api";
import type { Notification } from "../../types/notification";
import "./CreateNotificationForm.css";

interface CreateNotificationFormProps {
  defaultUserId: string;
  streamConnected: boolean;
  onCreatedWhileDisconnected: (notification: Notification) => void;
}

interface FormState {
  userId: string;
  type: string;
  title: string;
  message: string;
}

const initialForm: FormState = {
  userId: "user-123",
  type: "message",
  title: "Nova mensagem",
  message: "Voce recebeu uma nova mensagem."
};

export function CreateNotificationForm({
  defaultUserId,
  streamConnected,
  onCreatedWhileDisconnected
}: CreateNotificationFormProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!streamConnected && defaultUserId.trim()) {
      setForm((current) => ({ ...current, userId: defaultUserId.trim() }));
    }
  }, [defaultUserId, streamConnected]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setError(null);

    const payload = {
      userId: form.userId.trim(),
      type: form.type.trim(),
      title: form.title.trim(),
      message: form.message.trim(),
      data: { source: "frontend" }
    };

    if (!payload.userId || !payload.type || !payload.title || !payload.message) {
      setError("Preencha usuario, tipo, titulo e mensagem.");
      return;
    }

    setSubmitting(true);

    try {
      const created = await createNotification(payload);
      setFeedback(
        streamConnected
          ? "Notificacao criada. Aguarde o evento chegar pelo stream."
          : "Notificacao criada e lista atualizada."
      );

      if (!streamConnected) {
        onCreatedWhileDisconnected(created);
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Falha ao criar notificacao.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel create-form" aria-labelledby="create-title">
      <div className="panel__header">
        <div>
          <h2 id="create-title">Criar notificacao</h2>
          <p>Envie um evento para testar o fluxo PostgreSQL, Redis e SSE.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="create-form__grid">
          <label className="field" htmlFor="target-user-id">
            Usuario destinatario
            <input
              id="target-user-id"
              value={form.userId}
              onChange={(event) =>
                setForm((current) => ({ ...current, userId: event.target.value }))
              }
              autoComplete="off"
            />
          </label>

          <label className="field" htmlFor="notification-type">
            Tipo
            <input
              id="notification-type"
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value }))
              }
              autoComplete="off"
            />
          </label>
        </div>

        <label className="field" htmlFor="notification-title">
          Titulo
          <input
            id="notification-title"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            autoComplete="off"
          />
        </label>

        <label className="field" htmlFor="notification-message">
          Mensagem
          <textarea
            id="notification-message"
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({ ...current, message: event.target.value }))
            }
            rows={4}
          />
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? "Enviando..." : "Enviar notificacao"}
        </button>

        <div className="form-feedback" aria-live="polite">
          {feedback && <p className="success-message">{feedback}</p>}
          {error && <p className="error-message">{error}</p>}
        </div>
      </form>
    </section>
  );
}
