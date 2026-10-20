"use client";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Heart, MessageCircle } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { isGoogleReviewUrl, type FeedbackData } from "@/lib/feedback";
import { Modal } from "./ui/dialog";

export function GoogleReviewInvite({ url }: { url?: string }) {
  if (!url || !isGoogleReviewUrl(url)) return null;
  return (
    <div className="google-review-invite">
      <h3>Conte sua experiência no Google</h3>
      <p>
        Sua avaliação ajuda outras pessoas a conhecerem a casa. Você escreve e
        publica usando sua conta Google.
      </p>
      <a
        className="button button-outline"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Avaliar no Google <ExternalLink size={16} aria-hidden="true" />
      </a>
      <small>
        Abre em outra aba. O comentário daqui não é enviado ao Google.
      </small>
    </div>
  );
}

export function ProductFeedbackModal({
  restaurantId,
  product,
  onClose,
}: {
  restaurantId: string;
  product: { id: string; name: string } | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!product}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={product?.name || "Avaliações"}
      description="Opiniões de quem recebeu este prato."
    >
      {product && (
        <ProductFeedback
          key={product.id}
          restaurantId={restaurantId}
          productId={product.id}
        />
      )}
    </Modal>
  );
}

function ProductFeedback({
  restaurantId,
  productId,
}: {
  restaurantId: string;
  productId: string;
}) {
  const [data, setData] = useState<FeedbackData | null>(null);
  const [liked, setLiked] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const endpoint = `/api/restaurants/${restaurantId}/products/${productId}/feedback`;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await requestJson<FeedbackData>(endpoint);
      setData(next);
      setLiked(next.mine?.liked || false);
      setComment(next.mine?.comment || "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  async function save(nextLiked: boolean, nextComment: string) {
    if (!data?.eligibleOrderId || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await requestJson(endpoint, {
        order_id: data.eligibleOrderId,
        liked: nextLiked,
        comment: nextComment,
      });
      // Preserve the confirmed result even if refreshing public counts fails.
      setLiked(nextLiked);
      setComment(nextComment);
      setData({ ...data, mine: { liked: nextLiked, comment: nextComment } });
      setMessage(
        nextLiked || nextComment
          ? "Avaliação salva no cardápio."
          : "Sua avaliação foi removida.",
      );
      try {
        setData(await requestJson<FeedbackData>(endpoint));
      } catch {
        /* The write was confirmed. */
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="product-feedback">
      {loading && <p role="status">Carregando avaliações…</p>}
      {error && (
        <div className="notice" role="alert">
          {error}
          {!data && (
            <button
              className="button button-secondary"
              onClick={() => void load()}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}
      {data && (
        <>
          <div className="feedback-totals">
            <span>
              <Heart size={18} aria-hidden="true" /> {data.likes}{" "}
              {data.likes === 1 ? "curtida" : "curtidas"}
            </span>
            <span>
              <MessageCircle size={18} aria-hidden="true" /> {data.commentCount}{" "}
              {data.commentCount === 1 ? "comentário" : "comentários"}
            </span>
          </div>
          {data.eligibleOrderId ? (
            <form
              className="form-stack feedback-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save(liked, comment.trim());
              }}
            >
              <h3>Como estava seu prato?</h3>
              <button
                type="button"
                className={`button ${liked ? "button-primary" : "button-outline"}`}
                aria-pressed={liked}
                disabled={busy}
                onClick={() => {
                  setLiked(!liked);
                  setMessage("");
                }}
              >
                <Heart
                  size={18}
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                {liked ? "Curti este prato" : "Curtir prato"}
              </button>
              <label className="form-label">
                Seu comentário (opcional)
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={comment}
                  disabled={busy}
                  onChange={(event) => {
                    setComment(event.target.value);
                    setMessage("");
                  }}
                  aria-describedby="feedback-privacy"
                />
              </label>
              <p id="feedback-privacy" className="field-help">
                Seu comentário ficará público no cardápio, sem seu nome ou
                telefone. Não inclua dados pessoais. Você pode editar ou remover
                nesta sessão.
              </p>
              <div className="feedback-form-actions">
                <button className="button button-primary" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar avaliação"}
                </button>
                {data.mine && (data.mine.liked || data.mine.comment) && (
                  <button
                    type="button"
                    className="button button-ghost"
                    disabled={busy}
                    onClick={() => void save(false, "")}
                  >
                    Remover avaliação
                  </button>
                )}
              </div>
              {message && (
                <p role="status" className="feedback-saved">
                  {message}
                </p>
              )}
            </form>
          ) : (
            <p className="feedback-locked">
              Depois que a equipe marcar seu pedido como entregue, você poderá
              curtir e comentar os pratos que pediu neste navegador.
            </p>
          )}
          <GoogleReviewInvite url={data.googleReviewUrl} />
          <section
            className="feedback-comments"
            aria-label="Comentários dos clientes"
          >
            <h3>Quem provou, conta</h3>
            {!data.comments.length ? (
              <p>Ainda não há comentários sobre este prato.</p>
            ) : (
              <>
                <p className="field-help">
                  Até 20 comentários mais recentes · pedidos entregues
                </p>
                {data.comments.map((item) => (
                  <article key={item.id} className="feedback-comment">
                    <div>
                      <strong>Cliente · pedido entregue</strong>
                      <time dateTime={item.updated_at}>
                        {new Date(item.updated_at).toLocaleDateString("pt-BR")}
                      </time>
                    </div>
                    <p>{item.comment}</p>
                    {item.liked && (
                      <small>
                        <Heart size={14} aria-hidden="true" /> Curtiu este prato
                      </small>
                    )}
                  </article>
                ))}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
