"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Flame,
  ArrowUpRight,
  RefreshCw,
  Plus,
  ShoppingBag,
  Utensils,
  FolderOpen,
  Settings,
  Users,
  BarChart3,
  QrCode,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import QRCode from "qrcode";
import { browserClient } from "@/lib/supabase/browser";
import { requestJson } from "@/lib/client-api";
import type {
  Workspace,
  ProductRow,
  CategoryRow,
  RealOrder,
} from "@/lib/connected-types";
import { statusNames, statusFlow, type Status } from "@/lib/types";
import { money } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { MediaPicker } from "./media-picker";
import { VideoUploader, uploadProductVideo } from "./video-uploader";
import { VideoMetrics } from "./video-metrics";
type Save = (body: unknown) => Promise<void>;
const pages = [
  ["resumo", "Visão geral", LayoutDashboard],
  ["pedidos", "Pedidos", ShoppingBag],
  ["produtos", "Produtos", Utensils],
  ["categorias", "Categorias", FolderOpen],
  ["metricas", "Métricas", BarChart3],
  ["contatos", "Contatos", Users],
  ["configuracoes", "Configurações", Settings],
  ["qr", "QR das mesas", QrCode],
] as const;
export function ConnectedAdmin({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Workspace | null>(null);
  const [page, setPage] = useState("resumo");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const next = await requestJson<Workspace>(
        `/api/restaurants/${id}/workspace`,
      );
      setData(next);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const client = browserClient();
    const channel = client
      .channel(`orders:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${id}`,
        },
        () => void refresh(),
      )
      .subscribe();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      void client.removeChannel(channel);
    };
  }, [id, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const save: Save = async (body) => {
    setBusy(true);
    try {
      await requestJson(`/api/restaurants/${id}/catalog`, body);
      await refresh();
      setToast("Alteração salva.");
    } finally {
      setBusy(false);
    }
  };
  async function change(
    order: RealOrder,
    status: Status,
    reason?: string,
    estimate?: number,
  ) {
    setBusy(true);
    try {
      await requestJson(
        `/api/restaurants/${id}/orders/${order.id}`,
        { status, expected_status: order.status, reason, estimate },
        "PATCH",
      );
      await refresh();
      setToast("Pedido atualizado.");
    } finally {
      setBusy(false);
    }
  }
  const owner = data?.role === "owner";
  const allowed = pages.filter(
    (p) => owner || p[0] === "pedidos" || p[0] === "resumo",
  );
  return (
    <div className="connected-admin">
      <aside className="connected-sidebar">
        <Link className="brand" href="/gestao">
          <span className="brand-icon">
            <Flame />
          </span>
          <span className="brand-name">
            {data?.restaurant.name || "Seu restaurante"}
            <span className="brand-period">.</span>
          </span>
        </Link>
        <span className="sidebar-label">
          {owner ? "Gestão do restaurante" : "Operação de pedidos"}
        </span>
        <nav aria-label="Gestão">
          {allowed.map(([key, label, Icon]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              aria-current={page === key ? "page" : undefined}
              onClick={() => setPage(key)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="connected-sidebar-foot">
          {data && (
            <Link href={`/r/${data.restaurant.slug}`} target="_blank">
              Ver cardápio <ArrowUpRight size={17} />
            </Link>
          )}
          <button
            onClick={async () => {
              try {
                await requestJson("/api/auth", { action: "logout" });
                router.push("/login");
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <LogOut size={17} /> Sair da conta
          </button>
        </div>
      </aside>
      <main className="connected-main">
        <header className="connected-top">
          <span>
            <span
              className={`open-dot ${data?.restaurant.accepting_orders ? "" : "paused"}`}
            />
            {data?.restaurant.accepting_orders
              ? "Pedidos habilitados nos horários configurados"
              : "Pedidos pausados"}
          </span>
          <Button
            variant="outline"
            onClick={() => void refresh()}
            aria-label="Atualizar dados"
          >
            <RefreshCw size={16} />
            <span>Atualizar</span>
          </Button>
        </header>
        <div className="connected-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {data?.restaurant.name || "Seu restaurante"}
              </span>
              <h1>{pages.find((p) => p[0] === page)?.[1]}</h1>
              <p>
                {page === "pedidos"
                  ? "Cada pedido, do recebimento à entrega."
                  : "Tudo pronto para cuidar da sua casa."}
              </p>
            </div>
          </div>
          {loading && <p role="status">Carregando seus dados…</p>}
          {error && (
            <div role="alert" className="notice">
              {error} Os dados podem estar desatualizados.{" "}
              <button
                className="button button-secondary"
                onClick={() => void refresh()}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {data && (
            <>
              {page === "resumo" && (
                <>
                  <div className="connected-stats">
                    <Stat
                      label="Pedidos em aberto"
                      value={String(
                        data.orders.filter((o) =>
                          ["recebido", "em_preparo", "pronto"].includes(
                            o.status,
                          ),
                        ).length,
                      )}
                    />
                    <Stat
                      label="Pedidos entregues"
                      value={String(
                        data.orders.filter((o) => o.status === "entregue")
                          .length,
                      )}
                    />
                    <Stat
                      label="Total entregue"
                      value={money(
                        data.orders
                          .filter((o) => o.status === "entregue")
                          .reduce((s, o) => s + o.total_cents, 0),
                      )}
                    />
                  </div>
                  <p className="field-help">
                    Resumo dos últimos {data.orders.length} pedidos (limite:
                    200). Valores de pedidos; pagamento conferido no
                    estabelecimento.
                  </p>
                  <section className="admin-panel connected-panel">
                    <h2>Seu restaurante, no ar.</h2>
                    <p>
                      {data.products.length} produtos cadastrados ·{" "}
                      {data.tables.filter((t) => t.active).length} mesas ativas
                    </p>
                    {owner &&
                      (!data.products.length ||
                        !data.tables.length ||
                        !data.restaurant.opening_hours.length) && (
                        <div className="notice">
                          Para começar, cadastre produtos e configure as mesas e
                          os horários de atendimento.
                        </div>
                      )}
                    <Button onClick={() => setPage("pedidos")}>
                      Acompanhar pedidos
                    </Button>
                  </section>
                </>
              )}
              {page === "pedidos" && (
                <Orders orders={data.orders} busy={busy} change={change} />
              )}
              {owner && page === "produtos" && (
                <Products data={data} save={save} busy={busy} />
              )}
              {owner && page === "categorias" && (
                <Categories data={data} save={save} busy={busy} />
              )}
              {owner && page === "configuracoes" && (
                <SettingsForm data={data} save={save} busy={busy} />
              )}
              {owner && page === "contatos" && (
                <Contacts data={data} save={save} busy={busy} />
              )}
              {owner && page === "metricas" && <Metrics data={data} />}
              {owner && page === "qr" && <TableQR data={data} />}
            </>
          )}
        </div>
      </main>
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-panel connected-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Orders({
  orders,
  busy,
  change,
}: {
  orders: RealOrder[];
  busy: boolean;
  change: (
    order: RealOrder,
    status: Status,
    reason?: string,
    estimate?: number,
  ) => Promise<void>;
}) {
  const [selected, setSelected] = useState<RealOrder | null>(null);
  const [status, setStatus] = useState<Status>("em_preparo");
  const [error, setError] = useState("");
  const [history, setHistory] = useState(false);
  const columns: Status[] = history
    ? ["entregue", "cancelado"]
    : ["recebido", "em_preparo", "pronto"];
  return (
    <>
      <div className="connected-toolbar">
        <Button variant="outline" onClick={() => setHistory(!history)}>
          {history ? "Ver pedidos em aberto" : "Ver entregues e cancelados"}
        </Button>
        <span className="field-help">
          Tempo real com reconciliação a cada 15 segundos
        </span>
      </div>
      <div className="kanban connected-kanban">
        {columns.map((column) => (
          <section key={column} className="kanban-column">
            <h2>
              {statusNames[column]}{" "}
              <span>{orders.filter((o) => o.status === column).length}</span>
            </h2>
            <div className="kanban-cards">
              {orders
                .filter((o) => o.status === column)
                .map((order) => (
                  <article className="order-card" key={order.id}>
                    <div className="panel-heading">
                      <strong>#{order.number}</strong>
                      <span>Mesa {order.dining_tables?.number}</span>
                    </div>
                    <p>
                      {order.customer_name} ·{" "}
                      {new Date(order.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <ul className="connected-items">
                      {order.order_items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}× {item.product_name}
                          {item.note && <small>{item.note}</small>}
                        </li>
                      ))}
                    </ul>
                    <strong>{money(order.total_cents)}</strong>
                    {order.cancellation_reason && (
                      <p className="notice">{order.cancellation_reason}</p>
                    )}
                    {!history && (
                      <div className="connected-order-actions">
                        <Button
                          disabled={busy}
                          onClick={() => {
                            setError("");
                            setSelected(order);
                            setStatus(
                              statusFlow[statusFlow.indexOf(order.status) + 1],
                            );
                          }}
                        >
                          {column === "recebido"
                            ? "Iniciar preparo"
                            : column === "em_preparo"
                              ? "Marcar pronto"
                              : "Confirmar entrega"}
                        </Button>
                        {column !== "pronto" && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setError("");
                              setSelected(order);
                              setStatus("cancelado");
                            }}
                          >
                            Cancelar pedido
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              {!orders.some((o) => o.status === column) && (
                <div className="kanban-empty">
                  <ShoppingBag />
                  <p>Nenhum pedido nesta etapa.</p>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <Modal
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
        title={
          status === "cancelado"
            ? "Cancelar pedido"
            : `Pedido #${selected?.number}`
        }
        description="Confirme a atualização para avisar o cliente."
      >
        {selected && (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                await change(
                  selected,
                  status,
                  String(form.get("reason") || "") || undefined,
                  form.get("estimate")
                    ? Number(form.get("estimate"))
                    : undefined,
                );
                setSelected(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            {status === "cancelado" ? (
              <label className="form-label">
                Motivo do cancelamento
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={300}
                />
              </label>
            ) : (
              <>
                <p>
                  Atualizar para <strong>{statusNames[status]}</strong>.
                </p>
                {status === "em_preparo" && (
                  <label className="form-label">
                    Estimativa de preparo em minutos (opcional)
                    <input type="number" name="estimate" min={1} max={180} />
                  </label>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Atualizando…" : "Confirmar atualização"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
function Products({
  data,
  save,
  busy,
}: {
  data: Workspace;
  save: Save;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<ProductRow | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [checkingMedia, setCheckingMedia] = useState(false);
  const [uploaded, setUploaded] = useState<{
    id: string;
    state: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  function create() {
    setFile(null);
    setUploaded(null);
    setError("");
    setEdit({
      id: crypto.randomUUID(),
      restaurant_id: data.restaurant.id,
      category_id: data.categories[0]?.id || "",
      name: "",
      description: "",
      ingredients: "",
      allergens: "",
      price_cents: 0,
      photo_url: null,
      published: false,
      available: true,
      archived: false,
      position: data.products.length,
    });
  }
  return (
    <>
      <div className="connected-toolbar">
        <input
          aria-label="Buscar produtos"
          placeholder="Buscar no seu cardápio"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button onClick={create} disabled={!data.categories.length}>
          <Plus size={17} /> Novo produto
        </Button>
      </div>
      {error && !edit && <p role="alert">{error}</p>}
      <div className="connected-products">
        {data.products
          .filter((p) =>
            p.name
              .toLocaleLowerCase("pt-BR")
              .includes(query.toLocaleLowerCase("pt-BR")),
          )
          .map((product) => (
            <article key={product.id} className="admin-panel connected-product">
              <img
                src={product.photo_url || "/images/placeholder.svg"}
                alt={product.name}
              />
              <div>
                <small>
                  {
                    data.categories.find((c) => c.id === product.category_id)
                      ?.name
                  }
                </small>
                <h2>{product.name}</h2>
                <strong>{money(product.price_cents)}</strong>
                <p>
                  {product.published ? "Publicado" : "Rascunho"} ·{" "}
                  {product.available ? "Disponível" : "Indisponível"}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setFile(null);
                    setUploaded(null);
                    setEdit(product);
                  }}
                >
                  Editar produto
                </Button>
              </div>
            </article>
          ))}
      </div>
      {!data.products.length && (
        <div className="empty-state">
          <Utensils />
          <h2>O primeiro prato é por sua conta.</h2>
          <p>
            Adicione uma foto, os ingredientes e o preço para montar seu
            cardápio.
          </p>
        </div>
      )}
      <Modal
        open={!!edit}
        onOpenChange={(open) => {
          if (!open && !busy && !uploading) setEdit(null);
        }}
        title="Editar produto"
        description="Publique quando o produto estiver pronto para aparecer no cardápio."
      >
        {edit && (
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || uploading || checkingMedia) return;
              setUploading(true);
              setError("");
              let productSaved = false;
              try {
                let photo = edit.photo_url;
                if (file && !file.type.startsWith("video/")) {
                  const client = browserClient();
                  const path = `${data.restaurant.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
                  const { error } = await client.storage
                    .from("restaurant-media")
                    .upload(path, file, {
                      contentType: file.type,
                      upsert: false,
                    });
                  if (error)
                    throw new Error(
                      "Não foi possível enviar a foto. Tente novamente.",
                    );
                  photo = client.storage
                    .from("restaurant-media")
                    .getPublicUrl(path).data.publicUrl;
                  setEdit((previous) =>
                    previous ? { ...previous, photo_url: photo } : null,
                  );
                }
                await save({
                  action: "save_product",
                  product: {
                    id: edit.id,
                    category_id: edit.category_id,
                    name: edit.name,
                    description: edit.description,
                    ingredients: edit.ingredients,
                    allergens: edit.allergens,
                    price_cents: edit.price_cents,
                    photo_url: photo,
                    published: edit.published,
                    available: edit.available,
                    position: edit.position,
                  },
                });
                productSaved = true;
                if (file?.type.startsWith("video/")) {
                  const asset = await uploadProductVideo(
                    data.restaurant.id,
                    edit.id,
                    file,
                  );
                  setUploaded(asset);
                  setFile(null);
                } else setEdit(null);
              } catch (err) {
                setError(
                  productSaved
                    ? `O produto foi salvo, mas o vídeo não foi enviado. ${(err as Error).message}`
                    : (err as Error).message,
                );
              } finally {
                setUploading(false);
              }
            }}
          >
            <label className="form-label">
              Nome
              <input
                required
                minLength={2}
                maxLength={100}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <div className="form-columns">
              <label className="form-label">
                Preço (R$)
                <input
                  type="number"
                  required
                  min="0.01"
                  max="10000"
                  step="0.01"
                  value={edit.price_cents / 100 || ""}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      price_cents: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              <label className="form-label">
                Categoria
                <select
                  required
                  value={edit.category_id}
                  onChange={(e) =>
                    setEdit({ ...edit, category_id: e.target.value })
                  }
                >
                  {data.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(["description", "ingredients", "allergens"] as const).map(
              (field, index) => (
                <label className="form-label" key={field}>
                  {["Descrição", "Ingredientes", "Alérgenos"][index]}
                  <textarea
                    maxLength={[300, 1500, 400][index]}
                    value={edit[field]}
                    onChange={(e) =>
                      setEdit({ ...edit, [field]: e.target.value })
                    }
                  />
                </label>
              ),
            )}
            <MediaPicker
              photo={edit.photo_url}
              video={
                data.media.find(
                  (m) => m.product_id === edit.id && m.state === "ready",
                )?.playback_url
              }
              file={file}
              disabled={uploading || busy}
              onSelect={setFile}
              onChecking={setCheckingMedia}
            />
            {(uploaded || data.media.some((m) => m.product_id === edit.id)) && (
              <VideoUploader
                key={uploaded?.id || edit.id}
                restaurantId={data.restaurant.id}
                uploaded={uploaded}
                media={data.media.filter((m) => m.product_id === edit.id)}
              />
            )}
            <label className="form-label">
              Posição no cardápio
              <input
                type="number"
                min={0}
                max={10000}
                value={edit.position}
                onChange={(e) =>
                  setEdit({ ...edit, position: Number(e.target.value) })
                }
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={edit.published}
                onChange={(e) =>
                  setEdit({ ...edit, published: e.target.checked })
                }
              />{" "}
              Publicar no cardápio
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={edit.available}
                onChange={(e) =>
                  setEdit({ ...edit, available: e.target.checked })
                }
              />{" "}
              Disponível para pedidos
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || uploading || checkingMedia}>
              {uploading
                ? "Salvando e enviando mídia…"
                : busy
                  ? "Salvando…"
                  : "Salvar produto"}
            </Button>
            {data.products.some((p) => p.id === edit.id) && (
              <Button
                variant="ghost"
                disabled={busy || uploading || checkingMedia}
                onClick={async () => {
                  try {
                    await save({ action: "archive_product", id: edit.id });
                    setEdit(null);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                Arquivar produto
              </Button>
            )}
          </form>
        )}
      </Modal>
    </>
  );
}
function Categories({
  data,
  save,
  busy,
}: {
  data: Workspace;
  save: Save;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<CategoryRow | null>(null);
  const [error, setError] = useState("");
  return (
    <>
      <div className="connected-toolbar">
        <p>Use a posição para definir a ordem no cardápio.</p>
        <Button
          onClick={() => {
            setError("");
            setEdit({
              id: crypto.randomUUID(),
              restaurant_id: data.restaurant.id,
              name: "",
              position: data.categories.length,
              visible: true,
            });
          }}
        >
          <Plus size={17} /> Nova categoria
        </Button>
      </div>
      <div className="admin-panel connected-panel">
        {data.categories.map((category) => (
          <div className="connected-category" key={category.id}>
            <div>
              <strong>{category.name}</strong>
              <small>
                Posição {category.position} ·{" "}
                {category.visible ? "Visível" : "Oculta"} ·{" "}
                {
                  data.products.filter((p) => p.category_id === category.id)
                    .length
                }{" "}
                produtos
              </small>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setError("");
                setEdit(category);
              }}
            >
              Editar
            </Button>
          </div>
        ))}
      </div>
      <Modal
        open={!!edit}
        onOpenChange={(open) => {
          if (!open && !busy) setEdit(null);
        }}
        title="Categoria"
        description="Categorias ocultas não aparecem no cardápio público."
      >
        {edit && (
          <>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await save({
                    action: "save_category",
                    id: edit.id,
                    name: edit.name,
                    visible: edit.visible,
                    position: edit.position,
                  });
                  setEdit(null);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <label className="form-label">
                Nome
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <label className="form-label">
                Posição
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={edit.position}
                  onChange={(e) =>
                    setEdit({ ...edit, position: Number(e.target.value) })
                  }
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={edit.visible}
                  onChange={(e) =>
                    setEdit({ ...edit, visible: e.target.checked })
                  }
                />{" "}
                Visível no cardápio
              </label>
              <Button type="submit" disabled={busy}>
                Salvar categoria
              </Button>
            </form>
            {data.categories.some((c) => c.id === edit.id) &&
              data.categories.length > 1 && (
                <form
                  className="form-stack connected-danger"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    try {
                      await save({
                        action: "remove_category",
                        id: edit.id,
                        destination: form.get("destination"),
                      });
                      setEdit(null);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  <label className="form-label">
                    Mover produtos antes de excluir
                    <select name="destination" required>
                      {data.categories
                        .filter((c) => c.id !== edit.id)
                        .map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button type="submit" variant="outline" disabled={busy}>
                    Mover produtos e excluir categoria
                  </Button>
                </form>
              )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
function SettingsForm({
  data,
  save,
  busy,
}: {
  data: Workspace;
  save: Save;
  busy: boolean;
}) {
  const r = data.restaurant;
  const [error, setError] = useState("");
  return (
    <form
      className="admin-panel connected-panel form-stack connected-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const opening_hours = Array.from({ length: 7 }, (_, day) => day)
          .filter((day) => form.has(`day-${day}`))
          .map((day) => ({
            day,
            open: String(form.get(`open-${day}`)),
            close: String(form.get(`close-${day}`)),
          }));
        if (opening_hours.some((h) => h.open >= h.close)) {
          setError(
            "O fechamento deve ser após a abertura. Para atravessar meia-noite, use horários em cada dia.",
          );
          return;
        }
        try {
          await save({
            action: "settings",
            name: form.get("name"),
            subtitle: form.get("subtitle"),
            phone: form.get("phone"),
            address: form.get("address"),
            privacy_email: form.get("privacy_email"),
            retention_days: Number(form.get("retention_days")),
            tables: Number(form.get("tables")),
            accepting_orders: form.has("accepting_orders"),
            opening_hours,
          });
          setError("");
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <h2>A identidade da sua casa</h2>
      {(["name", "subtitle", "phone", "address", "privacy_email"] as const).map(
        (field, index) => (
          <label key={field} className="form-label">
            {
              [
                "Nome do restaurante",
                "Subtítulo",
                "Telefone",
                "Endereço",
                "E-mail de privacidade",
              ][index]
            }
            <input
              name={field}
              defaultValue={r[field]}
              required={field === "name" || field === "privacy_email"}
              type={field === "privacy_email" ? "email" : "text"}
              maxLength={
                field === "address"
                  ? 250
                  : field === "phone"
                    ? 20
                    : field === "name"
                      ? 80
                      : 100
              }
            />
          </label>
        ),
      )}
      <div className="form-columns">
        <label className="form-label">
          Número de mesas
          <input
            name="tables"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={Math.max(
              1,
              ...data.tables.filter((t) => t.active).map((t) => t.number),
            )}
          />
        </label>
        <label className="form-label">
          Prazo interno de revisão dos dados (dias)
          <input
            name="retention_days"
            type="number"
            min={1}
            max={730}
            required
            defaultValue={r.retention_days}
          />
          <small>
            Referência para a equipe. A exclusão automática ainda não está
            habilitada.
          </small>
        </label>
      </div>
      <h2>Horários de atendimento</h2>
      <p className="field-help">
        Fuso: {r.timezone}. Dias desmarcados permanecem fechados.
      </p>
      {Array.from({ length: 7 }, (_, day) => {
        const slot = r.opening_hours.find((h) => h.day === day);
        return (
          <div className="connected-hours" key={day}>
            <label className="checkbox-label">
              <input
                name={`day-${day}`}
                type="checkbox"
                defaultChecked={!!slot}
              />
              {
                [
                  "Domingo",
                  "Segunda",
                  "Terça",
                  "Quarta",
                  "Quinta",
                  "Sexta",
                  "Sábado",
                ][day]
              }
            </label>
            <input
              aria-label={`Abertura ${day}`}
              name={`open-${day}`}
              type="time"
              defaultValue={slot?.open || "18:00"}
              required
            />
            <span>às</span>
            <input
              aria-label={`Fechamento ${day}`}
              name={`close-${day}`}
              type="time"
              defaultValue={slot?.close || "23:00"}
              required
            />
          </div>
        );
      })}
      <label className="checkbox-label">
        <input
          name="accepting_orders"
          type="checkbox"
          defaultChecked={r.accepting_orders}
        />{" "}
        Habilitar pedidos nos horários acima
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Salvando…" : "Salvar configurações"}
      </Button>
    </form>
  );
}
function Contacts({
  data,
  save,
  busy,
}: {
  data: Workspace;
  save: Save;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  return (
    <>
      <p className="notice">
        Telefones informados pelos visitantes, sem verificação. Nenhuma mensagem
        é enviada automaticamente.
      </p>
      <div className="connected-toolbar">
        <input
          aria-label="Buscar contatos"
          placeholder="Nome ou telefone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>{data.contacts.length} contatos recentes (até 500)</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="admin-panel connected-table-wrap">
        <table className="connected-table">
          <thead>
            <tr>
              <th>Contato</th>
              <th>WhatsApp</th>
              <th>Marketing</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {data.contacts
              .filter((c) =>
                (c.name + " " + c.phone)
                  .toLocaleLowerCase("pt-BR")
                  .includes(query.toLocaleLowerCase("pt-BR")),
              )
              .map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    {c.phone}
                    <small>
                      {c.verified ? "Verificado" : "Não verificado"}
                    </small>
                  </td>
                  <td>
                    {
                      {
                        authorized: "Autorizado",
                        not_authorized: "Não autorizado",
                        revoked: "Revogado",
                      }[c.marketing_status]
                    }
                  </td>
                  <td>
                    {c.marketing_status === "authorized" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          try {
                            await save({
                              action: "revoke_marketing",
                              id: c.id,
                            });
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        Revogar autorização
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!data.contacts.length && (
          <div className="empty-state">
            <Users />
            <p>
              Os contatos aparecerão após pedidos ou cadastros de novidades.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
function Metrics({ data }: { data: Workspace }) {
  return <VideoMetrics data={data} />;
}
function TableQR({ data }: { data: Workspace }) {
  const [table, setTable] = useState(
    data.tables.find((t) => t.active)?.number || 1,
  );
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const link = `${window.location.origin}/r/${data.restaurant.slug}?mesa=${table}`;
    let active = true;
    QRCode.toDataURL(link, {
      width: 600,
      margin: 3,
      color: { dark: "#251c1a", light: "#ffffff" },
    })
      .then((value) => {
        if (active) {
          setQr(value);
          setUrl(link);
        }
      })
      .catch(() => setError("Não foi possível gerar o QR."));
    return () => {
      active = false;
    };
  }, [data.restaurant.slug, table]);
  return (
    <section className="admin-panel connected-panel connected-qr">
      <h2>Um cardápio em cada mesa.</h2>
      <p>Imprima o QR e deixe o cliente escolher com calma.</p>
      <label className="form-label">
        Mesa
        <select
          value={table}
          onChange={(e) => setTable(Number(e.target.value))}
        >
          {data.tables
            .filter((t) => t.active)
            .map((t) => (
              <option key={t.id} value={t.number}>
                Mesa {t.number}
              </option>
            ))}
        </select>
      </label>
      {!data.tables.some((t) => t.active) ? (
        <p>Configure suas mesas primeiro.</p>
      ) : (
        <>
          {qr && <img src={qr} alt={`QR do cardápio para a mesa ${table}`} />}
          <code>{url}</code>
          <a
            className="button button-primary"
            href={qr}
            download={`mesa-${table}.png`}
          >
            Baixar QR da mesa {table}
          </a>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
