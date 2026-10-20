"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Heart, MessageCircle } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { isGoogleReviewUrl, type FeedbackData } from "@/lib/feedback";
import { Modal } from "./ui/dialog";

export function SocialActions({
  restaurantId,
  productId,
  name,
  active,
  onComments,
}: {
  restaurantId: string;
  productId: string;
  name: string;
  active: boolean;
  onComments: () => void;
}) {
  const [data, setData] = useState<FeedbackData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const revision = useRef(0);
  const endpoint = `/api/restaurants/${restaurantId}/products/${productId}/feedback`;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const version = revision.current;
    void requestJson<FeedbackData>(endpoint)
      .then((next) => {
        if (!cancelled && version === revision.current) setData(next);
      })
      .catch(() => {
        /* A click retries and reports write errors. */
      });
    return () => {
      cancelled = true;
    };
  }, [active, endpoint]);
  async function toggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    revision.current += 1;
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/restaurants/${restaurantId}/session`, {});
      const current = await requestJson<FeedbackData>(endpoint);
      if (!current.enabled) {
        setData(current);
        return;
      }
      const liked = !current.mine?.liked;
      const comment = current.mine?.comment || "";
      await requestJson(endpoint, { liked, comment });
      setData({
        ...current,
        likes: current.likes + (liked ? 1 : -1),
        mine: { ...current.mine, liked, comment },
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (data?.enabled === false) return null;
  return (
    <>
      <button
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={data?.mine?.liked || false}
        aria-label={`${data?.mine?.liked ? "Descurtir" : "Curtir"} ${name}`}
      >
        <Heart size={25} fill={data?.mine?.liked ? "currentColor" : "none"} />
        <span>{data?.likes ? data.likes : "Curtir"}</span>
      </button>
      <button onClick={onComments} aria-label={`Comentários de ${name}`}>
        <MessageCircle size={25} />
        <span>{data?.commentCount ? data.commentCount : "Comentar"}</span>
      </button>
      {error && (
        <span className="social-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

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
      description="Curta e converse sobre este prato, mesmo antes de pedir."
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
      await requestJson(`/api/restaurants/${restaurantId}/session`, {});
      const next = await requestJson<FeedbackData>(endpoint);
      setData(next);
      setLiked(next.mine?.liked || false);
      setComment(next.mine?.comment || "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, restaurantId]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  async function save(
    nextLiked: boolean,
    nextComment: string,
    likeOnly = false,
  ) {
    if (!data?.enabled || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await requestJson(endpoint, {
        liked: nextLiked,
        comment: nextComment,
      });
      // Preserve the confirmed result even if refreshing public counts fails.
      setLiked(nextLiked);
      if (!likeOnly) setComment(nextComment);
      setData({
        ...data,
        mine: { ...data.mine, liked: nextLiked, comment: nextComment },
      });
      setMessage(
        likeOnly
          ? nextLiked
            ? "Curtida registrada."
            : "Curtida removida."
          : nextLiked || nextComment
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
          {data.enabled ? (
            <form
              className="form-stack feedback-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save(liked, comment.trim());
              }}
            >
              <h3>O que achou deste prato?</h3>
              <button
                type="button"
                className={`button ${liked ? "button-primary" : "button-outline"}`}
                aria-pressed={liked}
                disabled={busy}
                onClick={() => {
                  void save(!liked, data.mine?.comment || "", true);
                }}
              >
                <Heart
                  size={18}
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden="true"
                />
                {liked ? "Curti este prato" : "Curtir prato"}
              </button>
              {data.mine?.commentHidden && (
                <p className="notice">
                  Seu comentário foi ocultado pelo restaurante e não aparece no
                  cardápio.
                </p>
              )}
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
              O restaurante desativou as curtidas e os comentários.
            </p>
          )}
          <GoogleReviewInvite url={data.googleReviewUrl} />
          <section
            className="feedback-comments"
            aria-label="Comentários dos clientes"
          >
            <h3>Conversa sobre o prato</h3>
            {!data.comments.length ? (
              <p>Ainda não há comentários sobre este prato.</p>
            ) : (
              <>
                <p className="field-help">Até 20 comentários mais recentes</p>
                {data.comments.map((item) => (
                  <article key={item.id} className="feedback-comment">
                    <div>
                      <strong>
                        {item.verifiedPurchase
                          ? "Cliente · pedido entregue"
                          : "Visitante"}
                      </strong>
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
