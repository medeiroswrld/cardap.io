"use client";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChefHat,
  Clock3,
  CookingPot,
  MapPin,
  ShoppingBag,
  X,
} from "lucide-react";
import { useDemo } from "./demo-provider";
import { Brand, DemoBanner } from "./brand";
import { money, shortTime } from "@/lib/utils";
import { statusNames, statusFlow } from "@/lib/types";
export function TrackingPage({ id }: { id?: string }) {
  const { state, ready, session } = useDemo();
  const orders = state.orders.filter(
    (o) => o.session === session && !o.illustrative,
  );
  const order = orders.find((o) => o.id === id);
  return (
    <>
      <DemoBanner />
      <header className="customer-header">
        <Brand />
        <Link href="/r/demo" className="button button-outline">
          <ArrowLeft size={16} />
          Voltar ao cardápio
        </Link>
      </header>
      <main className="tracking-main">
        {!ready ? (
          <div className="empty-state">
            <Clock3 />
            <h1>Carregando seus pedidos…</h1>
          </div>
        ) : !id ? (
          <>
            <h1>Meus pedidos</h1>
            <p>Acompanhe os pedidos feitos neste navegador.</p>
            {orders.length ? (
              orders.map((o) => (
                <Link
                  className="order-list-row"
                  key={o.id}
                  href={`/r/demo/pedido/${o.id}`}
                >
                  <div>
                    <strong>Pedido #{o.number}</strong>
                    <span>
                      Mesa {o.table} • {shortTime(o.createdAt)}
                    </span>
                  </div>
                  <span className={`status-pill ${o.status}`}>
                    {statusNames[o.status]}
                  </span>
                  <strong>{money(o.total)}</strong>
                </Link>
              ))
            ) : (
              <div className="empty-state">
                <ShoppingBag size={40} />
                <h2>Seu primeiro pedido está esperando</h2>
                <p>Escolha algo gostoso no cardápio para começar.</p>
                <Link className="button button-primary" href="/r/demo">
                  Explorar o cardápio
                </Link>
              </div>
            )}
          </>
        ) : !order ? (
          <div className="empty-state">
            <ShoppingBag size={40} />
            <h1>Pedido não encontrado nesta sessão</h1>
            <p>Abra este link no navegador em que você fez o pedido.</p>
            <Link href="/r/demo" className="button button-primary">
              Voltar ao cardápio
            </Link>
          </div>
        ) : (
          <>
            <div
              className={`tracking-icon ${order.status === "cancelado" ? "cancelled" : ""}`}
            >
              {order.status === "cancelado" ? (
                <X size={32} />
              ) : (
                <Check size={32} />
              )}
            </div>
            <h1>
              {order.status === "cancelado"
                ? "Pedido cancelado"
                : order.status === "entregue"
                  ? "Bom apetite!"
                  : "Pedido de demonstração salvo!"}
            </h1>
            <p className="tracking-subtitle">
              Pedido #{order.number} <span>•</span> Mesa{" "}
              {String(order.table).padStart(2, "0")} <span>•</span>{" "}
              {shortTime(order.createdAt)}
            </p>
            <div className="notice">
              Este é um teste local. Nenhum pedido foi enviado a um restaurante.
            </div>
            <section className="tracking-card">
              <h2>{statusNames[order.status]}</h2>
              <p>
                {order.status === "recebido"
                  ? "Seu pedido foi salvo e aguarda o início do atendimento."
                  : order.status === "em_preparo"
                    ? "Seu pedido está sendo preparado pela cozinha."
                    : order.status === "pronto"
                      ? "Tudo pronto. A equipe já pode levar seu pedido."
                      : order.status === "entregue"
                        ? "Seu pedido foi entregue. Obrigado por escolher a casa."
                        : order.reason}
              </p>
              {order.estimate && (
                <p className="estimate">
                  <Clock3 size={16} />
                  Estimativa informada pela equipe: {order.estimate} minutos
                </p>
              )}
              {order.status !== "cancelado" && (
                <ol className="tracking-steps">
                  {statusFlow.map((s, i) => {
                    const Icon = [ShoppingBag, CookingPot, ChefHat, CheckCheck][
                      i
                    ];
                    const done = statusFlow.indexOf(order.status) >= i;
                    const event = order.history.find((e) => e.status === s);
                    return (
                      <li key={s} className={done ? "done" : ""}>
                        <span className="step-icon">
                          <Icon size={19} />
                        </span>
                        <strong>{statusNames[s]}</strong>
                        <small>
                          {event ? shortTime(event.at) : "Aguardando"}
                        </small>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="live-status">
                <span className="open-dot" />
                Atualiza ao mudar o pedido na gestão deste navegador
              </div>
            </section>
            <section className="tracking-card">
              <h2>O que vem por aí</h2>
              {order.items.map((i, index) => (
                <div className="tracking-item" key={index}>
                  <div>
                    <strong>
                      {i.quantity}× {i.name}
                    </strong>
                    {i.note && <p>{i.note}</p>}
                  </div>
                  <strong>{money(i.price * i.quantity)}</strong>
                </div>
              ))}
              <div className="total-row">
                <span>Total • pagamento no local</span>
                <strong>{money(order.total)}</strong>
              </div>
            </section>
            <div className="tracking-actions">
              <Link className="button button-outline" href="/r/demo">
                Continuar explorando
              </Link>
              <Link
                className="button button-primary"
                href="/demo/gestao/pedidos"
              >
                Testar na gestão
              </Link>
            </div>
            <p className="field-help">
              <MapPin size={15} /> O pedido fica associado a este navegador, sem
              acesso por telefone.
            </p>
          </>
        )}
      </main>
    </>
  );
}
