"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { AGENCY_MONTHLY_CENTS, FOUNDER_PRICE_CENTS, FOUNDER_SLOTS, PLAN_PRICES, SETUP_FEE_CENTS, type Cycle } from "@/lib/plans";
import { brl } from "@/lib/sales";

const ESSENCIAL = ["Cardápio em vídeo e QR", "Pedidos e impressão", "Pix, horários e entrega", "Logo, capa e cor"];
const PROFISSIONAL = ["Tudo do Essencial", "Clientes, cupons e reconquista", "Relatórios e financeiro", "Identidade completa"];
const AGENCIA = ["Tudo do Profissional", "Nós cuidamos do seu cardápio", "Implantação grátis"];

function PlanPrice({ cents, cycle }: { cents: number; cycle: Cycle }) {
  return (
    <p className="s-price">
      <strong>{brl(cents)}</strong>
      <span>/{cycle === "anual" ? "ano" : "mês"}</span>
    </p>
  );
}

export function PlansSection({ founderLeft, agencyUrl }: { founderLeft: number; agencyUrl: string | null }) {
  const [cycle, setCycle] = useState<Cycle>("mensal");
  const founder = founderLeft > 0 && cycle === "mensal";
  return (
    <section className="s-section" id="planos" aria-labelledby="plans-title">
      <div className="s-wrap">
        <h2 id="plans-title" className="s-title">Escolha seu plano</h2>
        <div className="s-toggle" role="group" aria-label="Ciclo de cobrança">
          <button type="button" aria-pressed={cycle === "mensal"} onClick={() => setCycle("mensal")}>Mensal</button>
          <button type="button" aria-pressed={cycle === "anual"} onClick={() => setCycle("anual")}>
            Anual <small>2 meses grátis</small>
          </button>
        </div>
        <div className="s-plans">
          <article className="s-plan">
            <h3>Essencial</h3>
            <PlanPrice cents={PLAN_PRICES.essencial[cycle]} cycle={cycle} />
            <ul>{ESSENCIAL.map((t) => <li key={t}><Check size={16} />{t}</li>)}</ul>
            <Link className="s-btn s-btn-outline" href={`/assinar?plano=essencial&ciclo=${cycle}`}>Assinar</Link>
          </article>
          <article className="s-plan s-plan-hot">
            <span className="s-badge"><Sparkles size={13} /> Mais escolhido</span>
            <h3>Profissional</h3>
            <PlanPrice cents={PLAN_PRICES.profissional[cycle]} cycle={cycle} />
            {founder ? (
              <p className="s-founder">
                Fundador: <strong>{brl(FOUNDER_PRICE_CENTS)}/mês</strong> para sempre · restam {founderLeft} de {FOUNDER_SLOTS}
              </p>
            ) : null}
            <ul>{PROFISSIONAL.map((t) => <li key={t}><Check size={16} />{t}</li>)}</ul>
            <Link className="s-btn s-btn-primary" href={`/assinar?plano=profissional&ciclo=${cycle}`}>Assinar</Link>
          </article>
          <article className="s-plan">
            <h3>Agência Amply</h3>
            <p className="s-price"><strong>{brl(AGENCY_MONTHLY_CENTS)}</strong><span>/mês</span></p>
            <ul>{AGENCIA.map((t) => <li key={t}><Check size={16} />{t}</li>)}</ul>
            {agencyUrl ? (
              <a className="s-btn s-btn-outline" href={agencyUrl} target="_blank" rel="noopener noreferrer">Falar com a gente</a>
            ) : (
              <span className="s-btn s-btn-disabled" aria-disabled="true">Em breve</span>
            )}
          </article>
        </div>
        <p className="s-note">Implantação de {brl(SETUP_FEE_CENTS)} paga uma vez, junto do 1º pagamento (grátis na Agência).</p>
      </div>
    </section>
  );
}
