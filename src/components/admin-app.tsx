"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  Flame,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Pencil,
  Plus,
  QrCode,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Trash2,
  Users,
  Utensils,
  Video,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { MediaPicker } from "./media-picker";
import { useDemoViews } from "@/lib/demo-metrics";
import { saveDemoVideo, removeDemoVideo } from "@/lib/demo-media";
import { Brand, DemoBanner } from "./brand";
import { useDemo } from "./demo-provider";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { money, shortTime } from "@/lib/utils";
import {
  statusFlow,
  statusNames,
  type Category,
  type Order,
  type Product,
  type Status,
} from "@/lib/types";
const pages = [
  { id: "visao-geral", name: "Visão geral", icon: LayoutDashboard },
  { id: "pedidos", name: "Pedidos", icon: ShoppingBag },
  { id: "produtos", name: "Produtos", icon: Utensils },
  { id: "categorias", name: "Categorias", icon: FolderOpen },
  { id: "metricas", name: "Métricas", icon: BarChart3 },
  { id: "contatos", name: "Contatos", icon: Users },
  { id: "configuracoes", name: "Configurações", icon: Settings },
];
export function AdminApp({ section }: { section: string }) {
  const { state, notify, update, ready } = useDemo();
  const [mobile, setMobile] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const panel = sidebarRef.current;
    if (!panel) return;
    const media = window.matchMedia("(max-width: 700px)");
    const sync = () => {
      panel.inert = media.matches && !mobile;
    };
    const onResize = () => {
      sync();
      if (!media.matches) setMobile(false);
    };
    sync();
    media.addEventListener("change", onResize);
    if (!mobile) return () => media.removeEventListener("change", onResize);
    const previousOverflow = document.body.style.overflow;
    const menuTrigger = menuTriggerRef.current;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled),select,input:not(:disabled)",
        ),
      ).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobile(false);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      media.removeEventListener("change", onResize);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => menuTrigger?.focus());
    };
  }, [mobile]);
  const [role, setRole] = useState<"dono" | "operacao">("dono");
  const page = pages.find((p) => p.id === section);
  const activeOrders = state.orders.filter(
    (o) => !["entregue", "cancelado"].includes(o.status),
  ).length;
  const restricted =
    role === "operacao" &&
    [
      "contatos",
      "configuracoes",
      "produtos",
      "categorias",
      "metricas",
    ].includes(section);
  return (
    <div className="admin-app">
      <aside
        ref={sidebarRef}
        id="management-navigation"
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile ? true : undefined}
        aria-label="Menu de gestão"
        className={`admin-sidebar ${mobile ? "expanded" : ""}`}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="mobile-close button button-icon button-ghost"
            onClick={() => setMobile(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="restaurant-switch">
          <span className="restaurant-avatar">
            <Flame size={21} />
          </span>
          <div>
            <strong>{state.settings.name}</strong>
            <small>Restaurante de demonstração</small>
          </div>
          <Store size={15} />
        </div>
        <div className="sidebar-caption">Seu restaurante</div>
        <nav aria-label="Gestão">
          {pages
            .filter(
              (p) =>
                role === "dono" || ["pedidos", "visao-geral"].includes(p.id),
            )
            .map((p) => (
              <Link
                onClick={() => setMobile(false)}
                key={p.id}
                href={`/demo/gestao/${p.id === "visao-geral" ? "" : p.id}`}
                className={`admin-nav-item ${p.id === section ? "active" : ""}`}
              >
                <p.icon size={19} />
                <span>{p.name}</span>
                {p.id === "pedidos" && (
                  <span className="nav-count">{activeOrders}</span>
                )}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-helper">
            <span>
              <Flame size={18} />
              Conheça o outro lado
            </span>
            <p>Veja como seus clientes descobrem os sabores da casa.</p>
            <Link href="/r/demo" target="_blank">
              Abrir cardápio <ArrowUpRight size={16} />
            </Link>
          </div>
          <label className="role-select">
            <span>Simular perfil</span>
            <select
              value={role}
              disabled={!ready}
              onChange={(e) => setRole(e.target.value as "dono" | "operacao")}
            >
              <option value="dono">Dono do restaurante</option>
              <option value="operacao">Equipe de operação</option>
            </select>
          </label>
          <div className="sidebar-user">
            <span>B</span>
            <div>
              <strong>Equipe Brasa</strong>
              <small>
                {role === "dono" ? "Administrador" : "Operação"} • demonstração
              </small>
            </div>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="admin-body" inert={mobile}>
        <DemoBanner />
        <header className="admin-topbar">
          <div>
            <button
              className="mobile-menu button button-ghost button-icon"
              aria-label="Abrir menu"
              aria-expanded={mobile}
              aria-controls="management-navigation"
              ref={menuTriggerRef}
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Seu restaurante</span>
            <ChevronRight size={14} />
            <strong>{page?.name || "Página não encontrada"}</strong>
          </div>
          <div>
            <button
              className={`accepting-toggle ${state.settings.accepting ? "on" : ""}`}
              disabled={role === "operacao"}
              onClick={() => {
                try {
                  update((s) => ({
                    ...s,
                    settings: {
                      ...s.settings,
                      accepting: !s.settings.accepting,
                    },
                  }));
                  notify(
                    state.settings.accepting
                      ? "Recebimento de pedidos pausado"
                      : "Recebimento de pedidos aberto",
                  );
                } catch {
                  notify("Não foi possível salvar a alteração.");
                }
              }}
            >
              <span
                className={state.settings.accepting ? "open-dot" : "closed-dot"}
              />
              {state.settings.accepting
                ? "Recebendo pedidos"
                : "Pedidos pausados"}
              <ChevronDown size={14} />
            </button>
            <Link
              className="button button-outline button-sm preview-link"
              href="/r/demo"
              target="_blank"
            >
              <ExternalLink size={15} />
              Ver cardápio
            </Link>
          </div>
        </header>
        <main className="admin-content">
          {!page ? (
            <div className="empty-state">
              <h1>Página não encontrada</h1>
              <Link href="/demo/gestao">Voltar à visão geral</Link>
            </div>
          ) : restricted ? (
            <div className="empty-state">
              <Users size={32} />
              <h1>Acesso reservado ao dono</h1>
              <p>
                O perfil de operação acompanha e atualiza os pedidos. Selecione
                o perfil dono para testar esta área.
              </p>
            </div>
          ) : section === "visao-geral" ? (
            <Overview />
          ) : section === "pedidos" ? (
            <Orders />
          ) : section === "produtos" ? (
            <Products />
          ) : section === "categorias" ? (
            <Categories />
          ) : section === "metricas" ? (
            <Metrics />
          ) : section === "contatos" ? (
            <Contacts />
          ) : (
            <Configuration />
          )}
        </main>
        <footer className="admin-footer">
          <span>Brasa • um bom pedido começa aqui.</span>
          <span>Ambiente de demonstração • dados locais</span>
        </footer>
      </div>
    </div>
  );
}
function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-heading-actions">{children}</div>}
    </div>
  );
}
function Overview() {
  const { state } = useDemo();
  const [period, setPeriod] = useState("hoje");
  const [now] = useState(() => new Date());
  const cutoff =
    period === "hoje"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      : now.getTime() - 7 * 86400000;
  const orders = state.orders.filter((o) => Date.parse(o.createdAt) >= cutoff);
  const open = orders.filter(
    (o) => !["cancelado", "entregue"].includes(o.status),
  );
  const total = orders
    .filter((o) => o.status !== "cancelado")
    .reduce((s, o) => s + o.total, 0);
  const popular = state.products
    .map((p) => ({
      ...p,
      quantity: orders
        .filter((o) => o.status !== "cancelado")
        .reduce(
          (sum, o) =>
            sum +
            o.items
              .filter((i) => i.productId === p.id)
              .reduce((n, i) => n + i.quantity, 0),
          0,
        ),
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .filter((p) => p.quantity > 0)
    .slice(0, 4);
  return (
    <>
      <PageHeading
        title="Tudo pronto para um bom serviço."
        description="Acompanhe o movimento e cuide de cada pedido, do começo ao fim."
      >
        <select
          aria-label="Período da visão geral"
          className="period-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="hoje">Hoje</option>
          <option value="semana">Últimos 7 dias</option>
        </select>
      </PageHeading>
      <div className="dashboard-stats">
        <Stat
          label="Pedidos em aberto"
          value={String(open.length).padStart(2, "0")}
          detail="Esperando o próximo passo"
          icon={ShoppingBag}
        />
        <Stat
          label="Valor dos pedidos"
          value={money(total)}
          detail="Pagamento realizado no local"
          icon={BarChart3}
        />
        <Stat
          label="Ticket médio dos pedidos"
          value={money(
            orders.filter((o) => o.status !== "cancelado").length
              ? total / orders.filter((o) => o.status !== "cancelado").length
              : 0,
          )}
          detail={`${orders.length} pedidos no período`}
          icon={Utensils}
        />
        <Stat
          label="Produtos no cardápio"
          value={String(
            state.products.filter((p) => p.published).length,
          ).padStart(2, "0")}
          detail={`${state.categories.filter((c) => c.visible).length} categorias para explorar`}
          icon={FolderOpen}
        />
      </div>
      <div className="dashboard-grid">
        <section className="admin-panel overview-orders">
          <div className="panel-heading">
            <div>
              <h2>A cozinha está em movimento</h2>
              <p>{open.length} pedidos para acompanhar</p>
            </div>
            <Link href="/demo/gestao/pedidos">
              Ver pedidos <ArrowRight size={16} />
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido / mesa</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th aria-label="Abrir pedido" />
                </tr>
              </thead>
              <tbody>
                {open.slice(0, 5).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>#{o.number}</strong>
                      <small>Mesa {String(o.table).padStart(2, "0")}</small>
                    </td>
                    <td>
                      {o.customer}
                      <small>{shortTime(o.createdAt)}</small>
                    </td>
                    <td>
                      <span className={`status-pill ${o.status}`}>
                        {statusNames[o.status]}
                      </span>
                    </td>
                    <td className="money-cell">{money(o.total)}</td>
                    <td>
                      <Link
                        className="button button-ghost button-icon"
                        href={`/demo/gestao/pedidos?pedido=${o.id}`}
                        aria-label={`Abrir pedido ${o.number}`}
                      >
                        <ChevronRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!open.length && (
              <div className="empty-state compact">
                <CheckCheck />
                <h3>Tudo em dia por aqui</h3>
                <p>Novos pedidos aparecerão nesta lista.</p>
              </div>
            )}
          </div>
          <div className="panel-footnote">
            <span className="open-dot" />
            Atualização entre abas deste navegador{" "}
            <span>Pedidos iniciais são exemplos</span>
          </div>
        </section>
        <section className="admin-panel popular-panel">
          <div className="panel-heading">
            <div>
              <h2>Os favoritos da mesa</h2>
              <p>Produtos mais pedidos no período</p>
            </div>
            <Flame size={20} />
          </div>
          <div className="popular-products">
            {popular.map((p, i) => (
              <div className="popular-product" key={p.id}>
                <span>{i + 1}</span>
                <img src={p.image} alt="" />
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.quantity} unidades pedidas</small>
                </div>
                <strong>{money(p.price)}</strong>
              </div>
            ))}
            {!popular.length && (
              <div className="empty-state compact">
                <Utensils />
                <p>Os primeiros pedidos vão aparecer aqui.</p>
              </div>
            )}
          </div>
          <Link href="/demo/gestao/produtos" className="panel-link">
            Gerenciar cardápio <ArrowRight size={16} />
          </Link>
        </section>
        <section className="menu-promo">
          <div>
            <span className="promo-icon">
              <Utensils size={24} />
            </span>
            <h2>
              Seu cardápio.
              <br />
              Dá vontade só de ver.
            </h2>
            <p>
              Fotos, sabores e boas escolhas.
              <br />
              Veja a experiência de quem senta à mesa.
            </p>
            <Link
              className="button button-primary"
              href="/r/demo"
              target="_blank"
            >
              Explorar o cardápio <ArrowUpRight size={17} />
            </Link>
          </div>
          <img
            src="/images/burger.jpg"
            alt="Smash da casa no cardápio de demonstração"
          />
        </section>
        <section className="admin-panel getting-started">
          <div className="panel-heading">
            <div>
              <h2>A casa, do seu jeito</h2>
              <p>Os próximos passos do seu restaurante</p>
            </div>
          </div>
          <Link href="/demo/gestao/produtos">
            <span className="setup-check">
              <Check size={16} />
            </span>
            <div>
              <strong>Organize os sabores</strong>
              <small>Edite produtos, ingredientes e preços</small>
            </div>
            <ChevronRight size={17} />
          </Link>
          <Link href="/demo/gestao/configuracoes">
            <span className="setup-number">
              <QrCode size={17} />
            </span>
            <div>
              <strong>Leve o cardápio até a mesa</strong>
              <small>Crie links e QR codes para cada mesa</small>
            </div>
            <ChevronRight size={17} />
          </Link>
          <Link href="/r/demo">
            <span className="setup-number">
              <ShoppingBag size={17} />
            </span>
            <div>
              <strong>Faça seu primeiro pedido de teste</strong>
              <small>Conheça o caminho até a cozinha</small>
            </div>
            <ChevronRight size={17} />
          </Link>
        </section>
      </div>
      <p className="data-caption">
        Valores de demonstração. O valor dos pedidos não representa faturamento
        pago.
      </p>
    </>
  );
}
function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ShoppingBag;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Orders() {
  const { state, changeStatus, notify, update } = useDemo();
  const [filter, setFilter] = useState("ativos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    queueMicrotask(() => {
      const id = new URLSearchParams(window.location.search).get("pedido");
      if (id) setSelected(id);
    });
  }, []);
  const order = state.orders.find((o) => o.id === selected);
  const orders = state.orders.filter(
    (o) =>
      (filter === "cancelados"
        ? o.status === "cancelado"
        : o.status !== "cancelado") &&
      `${o.number} ${o.customer} ${o.table}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const progress = (o: Order) => {
    try {
      const next = statusFlow[statusFlow.indexOf(o.status) + 1];
      if (next) {
        changeStatus(o.id, next);
        notify(`Pedido #${o.number}: ${statusNames[next].toLowerCase()}`);
      }
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <PageHeading
        title="Cada pedido, no seu tempo."
        description="Da primeira escolha ao último detalhe. Acompanhe o que está acontecendo."
      >
        <span className="live-label">
          <span className="open-dot" />
          Demonstração sincronizada
        </span>
      </PageHeading>
      <div className="admin-toolbar">
        <div className="segmented-control">
          <button
            className={filter === "ativos" ? "active" : ""}
            onClick={() => setFilter("ativos")}
          >
            Pedidos
          </button>
          <button
            className={filter === "cancelados" ? "active" : ""}
            onClick={() => setFilter("cancelados")}
          >
            Cancelados
          </button>
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Buscar pedido, cliente ou mesa"
            aria-label="Buscar pedidos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div
        className={`kanban ${filter === "cancelados" ? "single-column" : ""}`}
      >
        {(filter === "cancelados"
          ? (["cancelado"] as Status[])
          : statusFlow
        ).map((status) => (
          <section className={`kanban-column ${status}`} key={status}>
            <h2>
              <span className="column-dot" />
              {statusNames[status]}
              <span>{orders.filter((o) => o.status === status).length}</span>
            </h2>
            <div className="kanban-cards">
              {orders
                .filter((o) => o.status === status)
                .map((o) => (
                  <article className="order-card" key={o.id}>
                    <button
                      className="order-card-title"
                      onClick={() => {
                        setSelected(o.id);
                        setCancel(false);
                        setError("");
                      }}
                    >
                      <strong>Mesa {String(o.table).padStart(2, "0")}</strong>
                      <span>
                        #{o.number}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                    <div className="order-customer">
                      <span>{o.customer}</span>
                      <span>
                        <Clock3 size={13} />
                        {shortTime(o.createdAt)}
                      </span>
                    </div>
                    <div className="order-card-items">
                      {o.items.map((item, i) => (
                        <div key={i}>
                          <span>{item.quantity}×</span>
                          <p>
                            {item.name}
                            {item.note && <small>{item.note}</small>}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="order-card-total">
                      <span>
                        {o.illustrative
                          ? "Pedido de exemplo"
                          : "Teste neste navegador"}
                      </span>
                      <strong>{money(o.total)}</strong>
                    </div>
                    {status !== "entregue" && status !== "cancelado" ? (
                      <Button
                        variant={status === "recebido" ? "default" : "outline"}
                        className="full-width"
                        onClick={() => progress(o)}
                      >
                        {status === "recebido"
                          ? "Iniciar preparo"
                          : status === "em_preparo"
                            ? "Marcar como pronto"
                            : "Confirmar entrega"}
                        <ArrowRight size={15} />
                      </Button>
                    ) : (
                      <span className="order-done">
                        {status === "cancelado" ? o.reason : "Pedido entregue"}
                        {status === "entregue" && <CheckCheck size={16} />}
                      </span>
                    )}
                  </article>
                ))}
              {!orders.some((o) => o.status === status) && (
                <div className="kanban-empty">
                  <ShoppingBag size={23} />
                  <p>Nenhum pedido por aqui</p>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <Modal
        open={!!order}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title={
          order
            ? `Pedido #${order.number} • Mesa ${String(order.table).padStart(2, "0")}`
            : "Pedido"
        }
        description="Confira os itens, as observações e o andamento do pedido."
      >
        {order && (
          <div className="order-detail">
            <div className="order-detail-customer">
              <strong>{order.customer}</strong>
              <span>{order.phone || "Cliente de exemplo"}</span>
              <span className={`status-pill ${order.status}`}>
                {statusNames[order.status]}
              </span>
            </div>
            {order.items.map((item, i) => (
              <div className="tracking-item" key={i}>
                <div>
                  <strong>
                    {item.quantity}× {item.name}
                  </strong>
                  {item.note && <p>{item.note}</p>}
                </div>
                <span>{money(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="total-row">
              <strong>Total do pedido</strong>
              <strong>{money(order.total)}</strong>
            </div>
            <label className="form-label">
              Estimativa da equipe (minutos)
              <input
                type="number"
                min="1"
                max="180"
                defaultValue={order.estimate || ""}
                placeholder="Ex.: 25"
                onBlur={(e) => {
                  const estimate = Number(e.target.value);
                  if (estimate >= 1 && estimate <= 180) {
                    try {
                      update((s) => ({
                        ...s,
                        orders: s.orders.map((o) =>
                          o.id === order.id ? { ...o, estimate } : o,
                        ),
                      }));
                    } catch {
                      notify("Não foi possível salvar a estimativa.");
                    }
                  }
                }}
              />
            </label>
            <h3>Histórico do pedido</h3>
            <ol className="order-history">
              {order.history.map((event, i) => (
                <li key={i}>
                  <span>{statusNames[event.status]}</span>
                  <time>{shortTime(event.at)}</time>
                </li>
              ))}
            </ol>
            {order.reason && (
              <div className="notice">Motivo: {order.reason}</div>
            )}
            {!["cancelado", "entregue"].includes(order.status) && (
              <Button className="full-width" onClick={() => progress(order)}>
                {order.status === "recebido"
                  ? "Iniciar preparo"
                  : order.status === "em_preparo"
                    ? "Marcar como pronto"
                    : "Confirmar entrega"}
              </Button>
            )}
            {["recebido", "em_preparo"].includes(order.status) && (
              <>
                {!cancel ? (
                  <Button variant="ghost" onClick={() => setCancel(true)}>
                    Cancelar pedido
                  </Button>
                ) : (
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      try {
                        changeStatus(order.id, "cancelado", reason);
                        setCancel(false);
                        notify("Pedido cancelado com motivo registrado");
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    <label className="form-label">
                      Motivo do cancelamento
                      <textarea
                        required
                        minLength={3}
                        maxLength={300}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    {error && <p role="alert">{error}</p>}
                    <Button variant="destructive" type="submit">
                      Confirmar cancelamento
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
function Products() {
  const { state, update, notify } = useDemo();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("todos");
  const [editing, setEditing] = useState<Product | null>(null);
  const [archive, setArchive] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const items = state.products.filter(
    (p) =>
      (category === "todos" || p.categoryId === category) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const save = (product: Product) => {
    update((s) => ({
      ...s,
      products: isNew
        ? [...s.products, product]
        : s.products.map((p) => (p.id === product.id ? product : p)),
    }));
    setEditing(null);
    notify(
      product.published ? "Produto publicado no cardápio" : "Rascunho salvo",
    );
  };
  return (
    <>
      <PageHeading
        title="Os sabores da sua casa."
        description="Um bom cardápio começa com cada ingrediente no lugar certo."
      >
        <Button
          onClick={() => {
            setIsNew(true);
            setEditing({
              id: crypto.randomUUID(),
              name: "",
              description: "",
              ingredients: "",
              allergens: "",
              price: 0,
              categoryId: state.categories[0]?.id || "",
              image: "/images/burger.jpg",
              published: false,
              available: true,
            });
          }}
        >
          <Plus size={18} />
          Novo produto
        </Button>
      </PageHeading>
      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            placeholder="Buscar no seu cardápio"
            aria-label="Buscar produtos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filtrar por categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="todos">Todas as categorias</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="result-count">{items.length} produtos</span>
      </div>
      <section className="admin-panel">
        <div className="table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th>Publicação</th>
                <th>Disponível</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="product-table-name">
                      <img src={p.image} alt="" />
                      <div>
                        <strong>{p.name}</strong>
                        <small>
                          {p.video ? "Vídeo e foto" : "Foto do produto"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {state.categories.find((c) => c.id === p.categoryId)?.name}
                  </td>
                  <td className="money-cell">{money(p.price)}</td>
                  <td>
                    <span
                      className={`status-pill ${p.published ? "pronto" : "draft"}`}
                    >
                      {p.published ? "Publicado" : "Rascunho"}
                    </span>
                  </td>
                  <td>
                    <button
                      role="switch"
                      aria-checked={p.available}
                      aria-label={`Disponibilidade de ${p.name}`}
                      className={`switch ${p.available ? "checked" : ""}`}
                      onClick={() => {
                        try {
                          update((s) => ({
                            ...s,
                            products: s.products.map((item) =>
                              item.id === p.id
                                ? { ...item, available: !item.available }
                                : item,
                            ),
                          }));
                        } catch {
                          notify("Falha ao salvar disponibilidade.");
                        }
                      }}
                    >
                      <span />
                    </button>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="button button-ghost button-icon"
                        aria-label={`Editar ${p.name}`}
                        onClick={() => {
                          setIsNew(false);
                          setEditing(p);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="button button-ghost button-icon"
                        aria-label={`Duplicar ${p.name}`}
                        onClick={() => {
                          try {
                            update((s) => ({
                              ...s,
                              products: [
                                ...s.products,
                                {
                                  ...p,
                                  id: crypto.randomUUID(),
                                  name: `${p.name} (cópia)`,
                                  published: false,
                                },
                              ],
                            }));
                            notify("Cópia salva como rascunho");
                          } catch {
                            notify("Não foi possível duplicar.");
                          }
                        }}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="button button-ghost button-icon"
                        aria-label={`Arquivar ${p.name}`}
                        onClick={() => setArchive(p)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && (
            <div className="empty-state">
              <Utensils />
              <h2>Nenhum produto encontrado</h2>
              <p>Experimente outra busca ou cadastre um novo sabor.</p>
            </div>
          )}
        </div>
      </section>
      <Modal
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        title={isNew ? "Um novo sabor na casa" : "Editar produto"}
        description="Fotos bonitas abrem o apetite. Ingredientes claros ajudam a escolher."
        wide
      >
        {editing && (
          <ProductEditor key={editing.id} product={editing} onSave={save} />
        )}
      </Modal>
      <Modal
        open={!!archive}
        onOpenChange={(v) => {
          if (!v) setArchive(null);
        }}
        title="Arquivar este produto?"
        description="O produto sairá do cardápio público. Pedidos já feitos manterão os dados originais."
      >
        <p>{archive?.name}</p>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setArchive(null)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              try {
                update((s) => ({
                  ...s,
                  products: s.products.filter((p) => p.id !== archive?.id),
                }));
                setArchive(null);
                notify("Produto arquivado");
              } catch {
                notify("Não foi possível arquivar.");
              }
            }}
          >
            Arquivar produto
          </Button>
        </div>
      </Modal>
    </>
  );
}
function ProductEditor({
  product,
  onSave,
}: {
  product: Product;
  onSave: (p: Product) => void;
}) {
  const { state } = useDemo();
  const [p, setP] = useState(product);
  const [price, setPrice] = useState((product.price / 100).toFixed(2));
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [checkingMedia, setCheckingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof Product, value: string | boolean) =>
    setP((s) => ({ ...s, [key]: value }));
  const submit = async (published: boolean) => {
    if (saving || checkingMedia) return;
    setError("");
    const cents = Math.round(Number(price.replace(",", ".")) * 100);
    if (
      !p.name.trim() ||
      !p.categoryId ||
      !Number.isFinite(cents) ||
      cents <= 0
    ) {
      setError("Preencha o nome, a categoria e um preço maior que zero.");
      return;
    }
    setSaving(true);
    let video = p.video;
    try {
      let image = p.image;
      if (file?.type.startsWith("video/")) video = await saveDemoVideo(file);
      else if (file)
        image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("Não foi possível ler a foto."));
          reader.readAsDataURL(file);
        });
      onSave({
        ...p,
        image,
        video,
        name: p.name.trim(),
        price: cents,
        published,
      });
      if (
        p.video &&
        video !== p.video &&
        !state.products.some(
          (other) => other.id !== p.id && other.video === p.video,
        )
      )
        void removeDemoVideo(p.video).catch(() => {});
    } catch (err) {
      if (video && video !== p.video)
        void removeDemoVideo(video).catch(() => {});
      setError(
        (err as Error).message ||
          "Não foi possível salvar. O armazenamento pode estar cheio.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="product-editor"
      onSubmit={(e) => {
        e.preventDefault();
        submit(true);
      }}
    >
      <div className="editor-fields">
        <label className="form-label">
          Nome do produto
          <input
            required
            maxLength={80}
            value={p.name}
            onChange={(e) => field("name", e.target.value)}
            placeholder="Ex.: Smash da casa"
          />
        </label>
        <label className="form-label">
          Descrição curta
          <textarea
            required
            maxLength={180}
            value={p.description}
            onChange={(e) => field("description", e.target.value)}
            placeholder="O que torna esse sabor especial?"
          />
        </label>
        <div className="form-columns">
          <label className="form-label">
            Preço (R$)
            <input
              required
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="form-label">
            Categoria
            <select
              required
              value={p.categoryId}
              onChange={(e) => field("categoryId", e.target.value)}
            >
              {state.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-label">
          Ingredientes
          <textarea
            maxLength={1000}
            value={p.ingredients}
            onChange={(e) => field("ingredients", e.target.value)}
          />
        </label>
        <label className="form-label">
          Alergênicos
          <input
            maxLength={300}
            value={p.allergens}
            onChange={(e) => field("allergens", e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={p.available}
            onChange={(e) => field("available", e.target.checked)}
          />
          Produto disponível para pedir
        </label>
      </div>
      <div className="editor-media">
        <MediaPicker
          photo={p.image}
          video={p.video}
          file={file}
          demo
          disabled={saving || checkingMedia}
          onSelect={setFile}
          onChecking={setCheckingMedia}
        />
        <div className="notice small">
          <Eye size={18} />A foto é exibida quando o vídeo não está disponível.
        </div>
      </div>
      {error && (
        <div role="alert" className="form-error editor-error">
          {error}
        </div>
      )}
      <div className="editor-actions">
        <Button
          type="button"
          variant="outline"
          disabled={saving || checkingMedia}
          onClick={() => void submit(false)}
        >
          Salvar rascunho
        </Button>
        <Button type="submit" disabled={saving || checkingMedia}>
          <Check size={17} />
          {saving ? "Salvando…" : "Publicar produto"}
        </Button>
      </div>
    </form>
  );
}
function Categories() {
  const { state, update, notify } = useDemo();
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<Category | null>(null);
  const [destination, setDestination] = useState("");
  const count = (id: string) =>
    state.products.filter((p) => p.categoryId === id).length;
  const reorder = (index: number, delta: number) => {
    try {
      update((s) => {
        const categories = [...s.categories];
        [categories[index], categories[index + delta]] = [
          categories[index + delta],
          categories[index],
        ];
        return { ...s, categories };
      });
    } catch {
      notify("Não foi possível alterar a ordem.");
    }
  };
  return (
    <>
      <PageHeading
        title="Cada sabor no seu lugar."
        description="Organize as categorias na ordem em que aparecem no cardápio."
      >
        <Button
          onClick={() => {
            setEditing({
              id: crypto.randomUUID(),
              name: "",
              icon: "burger",
              visible: true,
            });
            setName("");
          }}
        >
          <Plus size={17} />
          Nova categoria
        </Button>
      </PageHeading>
      <section className="admin-panel categories-panel">
        {state.categories.map((c, i) => (
          <div className="category-row" key={c.id}>
            <span className="category-row-icon">
              <FolderOpen size={23} />
            </span>
            <div>
              <strong>{c.name}</strong>
              <small>
                {count(c.id)} produtos •{" "}
                {c.visible ? "Visível no cardápio" : "Oculta do cardápio"}
              </small>
            </div>
            <div className="table-actions">
              <button
                className="button button-icon button-ghost"
                disabled={i === 0}
                onClick={() => reorder(i, -1)}
                aria-label={`Mover ${c.name} para cima`}
              >
                <ArrowUp size={17} />
              </button>
              <button
                className="button button-icon button-ghost"
                disabled={i === state.categories.length - 1}
                onClick={() => reorder(i, 1)}
                aria-label={`Mover ${c.name} para baixo`}
              >
                <ArrowDown size={17} />
              </button>
              <button
                className={`switch ${c.visible ? "checked" : ""}`}
                role="switch"
                aria-checked={c.visible}
                aria-label={`Visibilidade de ${c.name}`}
                onClick={() => {
                  try {
                    update((s) => ({
                      ...s,
                      categories: s.categories.map((item) =>
                        item.id === c.id
                          ? { ...item, visible: !item.visible }
                          : item,
                      ),
                    }));
                  } catch {
                    notify("Não foi possível salvar.");
                  }
                }}
              >
                <span />
              </button>
              <button
                className="button button-icon button-ghost"
                aria-label={`Renomear ${c.name}`}
                onClick={() => {
                  setEditing(c);
                  setName(c.name);
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                className="button button-icon button-ghost"
                disabled={state.categories.length === 1}
                aria-label={`Remover ${c.name}`}
                onClick={() => {
                  setRemoving(c);
                  setDestination(
                    state.categories.find((item) => item.id !== c.id)?.id || "",
                  );
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </section>
      <p className="field-help">
        Categorias sem produtos publicados não aparecem para os clientes.
      </p>
      <Modal
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        title={editing?.name ? "Renomear categoria" : "Criar categoria"}
      >
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!editing) return;
            try {
              update((s) => ({
                ...s,
                categories: s.categories.some((c) => c.id === editing.id)
                  ? s.categories.map((c) =>
                      c.id === editing.id ? { ...c, name: name.trim() } : c,
                    )
                  : [...s.categories, { ...editing, name: name.trim() }],
              }));
              setEditing(null);
              notify("Categoria salva");
            } catch {
              notify("Não foi possível salvar.");
            }
          }}
        >
          <label className="form-label">
            Nome da categoria
            <input
              required
              minLength={2}
              maxLength={35}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Especiais da casa"
            />
          </label>
          <Button type="submit">Salvar categoria</Button>
        </form>
      </Modal>
      <Modal
        open={!!removing}
        onOpenChange={(v) => {
          if (!v) setRemoving(null);
        }}
        title={`Remover ${removing?.name || "categoria"}?`}
        description="Os produtos precisam continuar em uma categoria do cardápio."
      >
        {removing && count(removing.id) > 0 && (
          <label className="form-label">
            Mover {count(removing.id)} produtos para
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {state.categories
                .filter((c) => c.id !== removing.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setRemoving(null)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              try {
                update((s) => ({
                  ...s,
                  categories: s.categories.filter((c) => c.id !== removing?.id),
                  products: s.products.map((p) =>
                    p.categoryId === removing?.id
                      ? { ...p, categoryId: destination }
                      : p,
                  ),
                }));
                setRemoving(null);
                notify("Categoria removida");
              } catch {
                notify("Não foi possível remover.");
              }
            }}
          >
            Confirmar remoção
          </Button>
        </div>
      </Modal>
    </>
  );
}
function Metrics() {
  const { state } = useDemo();
  const [period, setPeriod] = useState("7");
  const [product, setProduct] = useState("todos");
  const recorded = useDemoViews();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const views = recorded.filter(
    (v) =>
      Date.parse(v.createdAt) >= now - Number(period) * 86400000 &&
      (product === "todos" || v.productId === product),
  );
  const qualified = views.filter((v) => v.qualified);
  const average = (values: typeof views) =>
    values.length
      ? `${(values.reduce((sum, v) => sum + v.watched, 0) / values.length).toFixed(1).replace(".", ",")} s`
      : "0 s";
  const completion = qualified.length
    ? Math.round(
        (100 * qualified.filter((v) => v.coverage >= 0.9).length) /
          qualified.length,
      )
    : 0;
  const orders = state.orders.filter(
    (o) =>
      Date.parse(o.createdAt) > now - Number(period) * 86400000 &&
      o.status !== "cancelado",
  );
  const rows = state.products.filter(
    (p) => product === "todos" || p.id === product,
  );
  return (
    <>
      <PageHeading
        title="Entenda o que desperta o apetite."
        description="Atenção e pedidos lado a lado. Cada número com seu contexto."
      >
        <select
          aria-label="Período das métricas"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="7">Últimos 7 dias</option>
          <option value="30">Últimos 30 dias</option>
        </select>
      </PageHeading>
      <div className="notice">
        <InfoIcon />
        Métricas dos vídeos assistidos neste navegador. Atualização automática a
        cada 5 segundos de reprodução ou ao pausar. Os pedidos incluem testes
        locais e exemplos.
      </div>
      <div className="dashboard-stats">
        <Stat
          label="Visualizações qualificadas"
          value={String(qualified.length)}
          detail="Pelo menos 1 segundo de reprodução visível"
          icon={Eye}
        />
        <Stat
          label="Tempo médio assistido"
          value={average(qualified)}
          detail="Por sessão qualificada, somente reprodução ativa"
          icon={Clock3}
        />
        <Stat
          label="Conclusão dos vídeos"
          value={`${completion}%`}
          detail="Cobertura de 90% dos trechos únicos"
          icon={Video}
        />
        <Stat
          label="Itens pedidos na demo"
          value={String(
            orders.reduce(
              (s, o) =>
                s +
                o.items
                  .filter((i) => product === "todos" || i.productId === product)
                  .reduce((n, i) => n + i.quantity, 0),
              0,
            ),
          )}
          detail="Inclui pedidos de exemplo"
          icon={ShoppingBag}
        />
      </div>
      {!views.length && (
        <div className="notice">
          Ainda não há reprodução de vídeo neste filtro. Abra um prato com vídeo
          no cardápio e assista por pelo menos um segundo. Fotos e prévias do
          cadastro não contam.
        </div>
      )}
      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <h2>Atenção por produto</h2>
            <p>Fotos não geram tempo assistido de vídeo.</p>
          </div>
          <select
            aria-label="Produto das métricas"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="todos">Todos os produtos</option>
            {state.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Mídia</th>
                <th>Sessões qualificadas</th>
                <th>Tempo médio</th>
                <th>Itens pedidos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>{p.video ? "Vídeo de teste" : "Foto"}</td>
                  <td>
                    {qualified.filter((v) => v.productId === p.id).length}
                  </td>
                  <td>
                    {average(qualified.filter((v) => v.productId === p.id))}
                  </td>
                  <td>
                    {orders.reduce(
                      (s, o) =>
                        s +
                        o.items
                          .filter((i) => i.productId === p.id)
                          .reduce((n, i) => n + i.quantity, 0),
                      0,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="metric-definitions">
        <h2>O que cada indicador significa</h2>
        <p>
          <strong>Visualização qualificada:</strong> pelo menos metade do vídeo
          visível por um segundo, com reprodução ativa.
        </p>
        <p>
          <strong>Tempo assistido:</strong> intervalos efetivos de reprodução,
          excluindo pausa, carregamento e aba oculta.
        </p>
        <p>
          <strong>Conclusão:</strong> sessões que assistiram a 90% dos trechos
          distintos. Repetir um trecho não aumenta a cobertura.
        </p>
        <p>
          A coleta pelo navegador é uma estimativa. Associação entre vídeo e
          pedido não demonstra que um causou o outro.
        </p>
      </div>
    </>
  );
}
function InfoIcon() {
  return <Eye size={19} />;
}
function Contacts() {
  const { state, update, notify } = useDemo();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");
  const [selected, setSelected] = useState<string | null>(null);
  const contact = state.contacts.find((c) => c.id === selected);
  const contacts = state.contacts.filter(
    (c) =>
      (filter === "todos" || c.consent === filter) &&
      `${c.name} ${c.phone}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="Boas relações começam na mesa."
        description="Contatos para atendimento, com escolhas de privacidade respeitadas."
      />
      <div className="notice">
        <Users size={18} />
        Números informados não são verificados. Campanhas e envios de WhatsApp
        não estão habilitados.
      </div>
      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nome ou telefone"
            aria-label="Buscar contatos"
          />
        </label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtrar autorização"
        >
          <option value="todos">Todas as autorizações</option>
          <option value="autorizado">Autorizados</option>
          <option value="nao_autorizado">Não autorizados</option>
          <option value="revogado">Revogados</option>
        </select>
      </div>
      <section className="admin-panel">
        {contacts.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>WhatsApp</th>
                  <th>Origem</th>
                  <th>Última interação</th>
                  <th>Marketing</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>
                      {c.phone}
                      <small>Não verificado</small>
                    </td>
                    <td>{c.source}</td>
                    <td>{new Date(c.lastAt).toLocaleDateString("pt-BR")}</td>
                    <td>
                      <span
                        className={`status-pill ${c.consent === "autorizado" ? "pronto" : "draft"}`}
                      >
                        {c.consent === "autorizado"
                          ? "Autorizado"
                          : c.consent === "revogado"
                            ? "Revogado"
                            : "Não autorizado"}
                      </span>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Detalhes de ${c.name}`}
                        onClick={() => setSelected(c.id)}
                      >
                        <ChevronRight size={18} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Users size={40} />
            <h2>O primeiro contato começa com um pedido</h2>
            <p>
              Os dados informados no checkout aparecerão aqui.
              <br />
              Faça um pedido de teste para conhecer o fluxo.
            </p>
            <Link href="/r/demo" className="button button-outline">
              Abrir cardápio <ArrowUpRight size={16} />
            </Link>
          </div>
        )}
      </section>
      <Modal
        open={!!contact}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title={contact?.name || "Contato"}
        description="Informações declaradas para atendimento. Identidade não verificada."
      >
        {contact && (
          <div className="form-stack">
            <p>{contact.phone}</p>
            <h3>Registro de preferências</h3>
            {contact.events.map((event, i) => (
              <div className="consent-event" key={i}>
                <strong>
                  {event.action === "revogado"
                    ? "Autorização revogada"
                    : event.action === "autorizado"
                      ? "Autorização concedida"
                      : "Sem autorização"}
                </strong>
                <small>
                  {new Date(event.at).toLocaleString("pt-BR")} • Versão{" "}
                  {event.version}
                </small>
                <p>{event.text}</p>
              </div>
            ))}
            {contact.consent === "autorizado" && (
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    update((s) => ({
                      ...s,
                      contacts: s.contacts.map((c) =>
                        c.id === contact.id
                          ? {
                              ...c,
                              consent: "revogado",
                              events: [
                                ...c.events,
                                {
                                  at: new Date().toISOString(),
                                  action: "revogado",
                                  text: "Revogação registrada pelo restaurante.",
                                  version: "1",
                                },
                              ],
                            }
                          : c,
                      ),
                    }));
                    notify("Autorização revogada");
                  } catch {
                    notify("Não foi possível revogar.");
                  }
                }}
              >
                Revogar autorização de marketing
              </Button>
            )}
            <p className="field-help">
              Um novo pedido não reativa autorização revogada nem comprova a
              identidade do contato.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
function Configuration() {
  const { state, update, notify } = useDemo();
  const [tab, setTab] = useState("perfil");
  const [table, setTable] = useState(1);
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const link = `${window.location.origin}/r/demo?mesa=${table}`;
    queueMicrotask(() => setUrl(link));
    void QRCode.toDataURL(link, {
      width: 320,
      margin: 2,
      color: { dark: "#251C1A", light: "#FFFFFF" },
    }).then(setQr);
  }, [table]);
  return (
    <>
      <PageHeading
        title="Uma casa com a sua assinatura."
        description="Cuide do perfil, das mesas e de como seus clientes chegam até você."
      />
      <div className="settings-tabs">
        {[
          { id: "perfil", name: "Perfil da casa" },
          { id: "mesas", name: "Mesas e QR codes" },
          { id: "equipe", name: "Equipe e acesso" },
          { id: "privacidade", name: "Privacidade" },
        ].map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      {tab === "perfil" ? (
        <form
          className="admin-panel settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              update((s) => ({
                ...s,
                settings: {
                  ...s.settings,
                  name: String(form.get("name")),
                  subtitle: String(form.get("subtitle")),
                  phone: String(form.get("phone")),
                  address: String(form.get("address")),
                  hours: String(form.get("hours")),
                },
              }));
              notify("Perfil salvo na demonstração");
            } catch {
              notify("Não foi possível salvar.");
            }
          }}
        >
          <h2>Sobre seu restaurante</h2>
          <div className="form-columns">
            <label className="form-label">
              Nome comercial
              <input
                required
                name="name"
                maxLength={60}
                defaultValue={state.settings.name}
              />
            </label>
            <label className="form-label">
              Descrição curta
              <input
                name="subtitle"
                maxLength={100}
                defaultValue={state.settings.subtitle}
              />
            </label>
          </div>
          <label className="form-label">
            WhatsApp do restaurante
            <input
              type="tel"
              name="phone"
              defaultValue={state.settings.phone}
              placeholder="(11) 99999-9999"
            />
          </label>
          <label className="form-label">
            Endereço
            <input
              name="address"
              maxLength={200}
              defaultValue={state.settings.address}
            />
          </label>
          <label className="form-label">
            Horários de atendimento
            <input
              name="hours"
              maxLength={200}
              defaultValue={state.settings.hours}
            />
          </label>
          <p className="field-help">
            Na demonstração, os horários são informativos. Use o botão
            “Recebendo pedidos” para abrir ou pausar a operação.
          </p>
          <Button type="submit">Salvar alterações</Button>
        </form>
      ) : tab === "mesas" ? (
        <section className="admin-panel settings-form">
          <h2>O cardápio a um toque de distância</h2>
          <p>
            Cada mesa tem seu próprio link. O mesmo endereço serve para QR code
            e NFC.
          </p>
          <div className="table-qr-layout">
            <div>
              <label className="form-label">
                Quantidade de mesas
                <input
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={state.settings.tables}
                  onBlur={(e) => {
                    const tables = Number(e.target.value);
                    if (
                      tables >= 1 &&
                      tables <= 100 &&
                      Number.isInteger(tables)
                    ) {
                      try {
                        update((s) => ({
                          ...s,
                          settings: { ...s.settings, tables },
                        }));
                        setTable((t) => Math.min(t, tables));
                        notify("Mesas atualizadas");
                      } catch {
                        notify("Não foi possível salvar as mesas.");
                      }
                    } else notify("Informe de 1 a 100 mesas.");
                  }}
                />
              </label>
              <label className="form-label">
                Gerar link para
                <select
                  value={table}
                  onChange={(e) => setTable(Number(e.target.value))}
                >
                  {Array.from({ length: state.settings.tables }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Mesa {String(i + 1).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Link da mesa
                <input readOnly value={url} />
              </label>
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => notify("Link copiado"))
                    .catch(() => notify("Selecione e copie o endereço acima."))
                }
              >
                <Copy size={16} />
                Copiar link
              </Button>
              <p className="field-help">
                Um link localhost só abre neste computador. Para testar em outro
                dispositivo, publique o app ou use o IP local na mesma rede. A
                gravação de uma tag NFC é feita fisicamente.
              </p>
            </div>
            <div className="qr-preview">
              {qr && (
                <img
                  src={qr}
                  alt={`QR code do cardápio para a mesa ${table}`}
                />
              )}
              <strong>Mesa {String(table).padStart(2, "0")}</strong>
              <span>Aponte a câmera. Escolha seu favorito.</span>
              {qr && (
                <a
                  className="button button-outline"
                  href={qr}
                  download={`brasa-mesa-${table}.png`}
                >
                  <ArrowDownToLine size={16} />
                  Baixar QR code
                </a>
              )}
            </div>
          </div>
        </section>
      ) : tab === "equipe" ? (
        <section className="admin-panel settings-form">
          <h2>Uma boa equipe, cada pessoa no seu lugar</h2>
          <div className="role-card">
            <Users />
            <div>
              <strong>Dono</strong>
              <p>Produtos, pedidos, contatos, métricas e configurações.</p>
            </div>
          </div>
          <div className="role-card">
            <ShoppingBag />
            <div>
              <strong>Operação</strong>
              <p>Pedidos, andamento, estimativas e cancelamentos.</p>
            </div>
          </div>
          <div className="notice">
            A troca de perfil no menu é apenas uma prévia visual. Autenticação e
            permissões reais dependem do Supabase configurado.
          </div>
          <Link className="button button-outline" href="/login">
            Acesso ao ambiente conectado
          </Link>
        </section>
      ) : (
        <form
          className="admin-panel settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              update((s) => ({
                ...s,
                settings: {
                  ...s.settings,
                  privacyEmail: String(form.get("email")),
                },
              }));
              notify("Canal de privacidade salvo");
            } catch {
              notify("Não foi possível salvar.");
            }
          }}
        >
          <h2>Privacidade faz parte do atendimento</h2>
          <label className="form-label">
            E-mail de contato para privacidade
            <input
              type="email"
              name="email"
              defaultValue={state.settings.privacyEmail}
              placeholder="privacidade@seurestaurante.com.br"
            />
          </label>
          <p>
            Nome e telefone do checkout servem ao atendimento. Marketing exige
            uma escolha separada e opcional.
          </p>
          <p>
            Os dados de demonstração ficam neste navegador. Para excluí-los,
            limpe os dados do site nas configurações do navegador. Defina
            retenção e exclusão antes de usar dados reais.
          </p>
          <Button type="submit">Salvar canal de contato</Button>
          <Link href="/privacidade">Ver informações de privacidade</Link>
        </form>
      )}
    </>
  );
}
