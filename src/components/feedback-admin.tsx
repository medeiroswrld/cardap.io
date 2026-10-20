"use client";
import { Heart, MessageCircle } from "lucide-react";
import { useState } from "react";
import type { Workspace } from "@/lib/connected-types";
export function FeedbackAdmin({
  feedback,
  enabled,
  busy,
  save,
}: {
  feedback: Workspace["feedback"];
  enabled: boolean;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
}) {
  const [error, setError] = useState("");
  async function update(body: unknown) {
    setError("");
    try {
      await save(body);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const likes = feedback.filter((f) => f.liked).length;
  const comments = feedback.filter(
    (f) => f.comment && !f.comment_hidden,
  ).length;
  return (
    <section className="admin-panel connected-panel">
      <h2>Conversa no cardápio</h2>
      <p>
        Visitantes podem curtir e comentar antes de pedir, em pratos com foto ou
        vídeo.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) =>
            void update({
              action: "feedback_settings",
              enabled: event.target.checked,
            })
          }
        />
        Permitir curtidas e comentários no cardápio
      </label>
      <p className="field-help">
        Ao desligar, os botões e as interações ficam ocultos para os visitantes.
        O histórico é preservado e reaparece ao ligar novamente.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="feedback-totals">
        <span>
          <Heart size={18} /> {likes} {likes === 1 ? "curtida" : "curtidas"}
        </span>
        <span>
          <MessageCircle size={18} /> {comments}{" "}
          {comments === 1 ? "comentário" : "comentários"}
        </span>
      </div>
      <p className="field-help">
        Últimas {feedback.length} avaliações, limitadas a 200. Estes números são
        do cardápio; não incluem avaliações do Google.
      </p>
      {!feedback.length && (
        <p>
          Ainda não há interações. Visitantes podem participar pelo coração ou
          pelo botão de comentários no cardápio.
        </p>
      )}
      {feedback.map((item) => (
        <article className="feedback-comment" key={item.id}>
          <div>
            <strong>{item.products?.name || "Produto"}</strong>
            <time dateTime={item.updated_at}>
              {new Date(item.updated_at).toLocaleDateString("pt-BR")}
            </time>
          </div>
          {item.comment && <p>{item.comment}</p>}
          {item.comment && (
            <>
              {item.comment_hidden && (
                <p className="field-help">Oculto no cardápio</p>
              )}
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() =>
                  void update({
                    action: "moderate_feedback",
                    id: item.id,
                    hidden: !item.comment_hidden,
                  })
                }
              >
                {item.comment_hidden
                  ? "Restaurar comentário"
                  : "Ocultar comentário"}
              </button>
            </>
          )}
          {item.liked && (
            <small>
              <Heart size={14} /> Curtiu este prato
            </small>
          )}
        </article>
      ))}
    </section>
  );
}
