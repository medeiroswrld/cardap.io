"use client";
import { Heart, MessageCircle } from "lucide-react";
import type { Workspace } from "@/lib/connected-types";
export function FeedbackAdmin({
  feedback,
}: {
  feedback: Workspace["feedback"];
}) {
  const likes = feedback.filter((f) => f.liked).length;
  const comments = feedback.filter((f) => f.comment).length;
  return (
    <section className="admin-panel connected-panel">
      <h2>A voz de quem provou</h2>
      <p>
        Curtidas e comentários de pedidos entregues. Válidos para pratos com
        foto ou vídeo.
      </p>
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
          Ainda não há avaliações. O convite aparece quando um pedido é marcado
          como entregue.
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
