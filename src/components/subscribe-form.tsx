"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import {
  FOUNDER_PRICE_CENTS,
  PLAN_PRICES,
  SETUP_FEE_CENTS,
  firstChargeCents,
  isSellablePlan,
  priceFor,
  type Cycle,
  type SellablePlan,
} from "@/lib/plans";
import { apiErrorMessages } from "@/lib/client-api";
import {
  brl,
  formatDocument,
  formatPhone,
  safeRedirect,
  validateSubscription,
  type SubscribeErrors,
  type SubscribeFields,
} from "@/lib/sales";

const PLAN_NAMES: Record<SellablePlan, string> = { essencial: "Essencial", profissional: "Profissional" };
const EMPTY: SubscribeFields = { restaurantName: "", ownerName: "", email: "", phone: "", document: "", password: "", acceptTerms: false };
const REDIRECT_DELAY_MS = 3000;

type Notice = { text: string; href: string };

export function SubscribeForm({ founderLeft }: { founderLeft: number }) {
  const params = useSearchParams();
  const formId = useId();
  const [plan, setPlan] = useState<SellablePlan>(() => {
    const p = params.get("plano");
    return isSellablePlan(p) ? p : "profissional";
  });
  const [cycle, setCycle] = useState<Cycle>(() => (params.get("ciclo") === "anual" ? "anual" : "mensal"));
  const [values, setValues] = useState<SubscribeFields>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof SubscribeFields, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<SubscribeErrors>({});
  const [formError, setFormError] = useState<{ text: string; login?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const expectFounder = founderLeft > 0 && plan === "profissional" && cycle === "mensal";
  const monthlyOrYearly = priceFor(plan, cycle, expectFounder);
  const total = firstChargeCents(plan, cycle, expectFounder);
  const errors: SubscribeErrors = { ...validateSubscription(values), ...serverErrors };
  const show = (k: keyof SubscribeFields) => (touched[k] || serverErrors[k] ? errors[k] : undefined);

  function set<K extends keyof SubscribeFields>(key: K, value: SubscribeFields[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (serverErrors[key]) setServerErrors((s) => ({ ...s, [key]: undefined }));
    setFormError(null);
  }
  const blur = (key: keyof SubscribeFields) => setTouched((t) => ({ ...t, [key]: true }));

  function go(url: string) {
    window.location.href = url;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || notice) return;
    setTouched({ restaurantName: true, ownerName: true, email: true, phone: true, document: true, password: true, acceptTerms: true });
    if (Object.keys(validateSubscription(values)).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cycle, ...values, acceptTerms: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string; founder?: boolean; priceCents?: number; error?: string };
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Não foi possível concluir. Tente novamente.";
        if (res.status === 409) setFormError({ text: apiErrorMessages.EMAIL_IN_USE ?? message, login: true });
        else if (message === apiErrorMessages.INVALID_DOCUMENT) setServerErrors({ document: message });
        else if (message === apiErrorMessages.WEAK_PASSWORD) setServerErrors({ password: message });
        else setFormError({ text: message });
        setBusy(false);
        return;
      }
      const target = safeRedirect(data.redirect);
      if (!target) {
        // The account exists; the management area has the payment screen.
        setFormError({ text: "Sua conta foi criada, mas não conseguimos abrir o pagamento agora. Entre na gestão para continuar." });
        setNotice({ text: "", href: "/gestao" });
        setBusy(false);
        return;
      }
      if (expectFounder && data.founder === false) {
        const price = typeof data.priceCents === "number" && data.priceCents > 0 ? data.priceCents : PLAN_PRICES.profissional.mensal;
        setNotice({ text: `Vaga de fundador esgotada; seu plano ficou em ${brl(price)}/mês.`, href: target });
        timer.current = setTimeout(() => go(target), REDIRECT_DELAY_MS);
        return;
      }
      go(target);
    } catch {
      setFormError({ text: "Sem conexão. Confira a internet e tente novamente." });
      setBusy(false);
    }
  }

  return (
    <div className="s-assinar">
      <form id={formId} className="s-form" onSubmit={submit} noValidate>
        <fieldset className="s-fieldset">
          <legend>Plano</legend>
          <div className="s-radio-row">
            {(["essencial", "profissional"] as SellablePlan[]).map((p) => (
              <label key={p} className={`s-radio ${plan === p ? "on" : ""}`}>
                <input type="radio" name="plano" checked={plan === p} onChange={() => setPlan(p)} />
                <span>{PLAN_NAMES[p]}</span>
                <small>{brl(PLAN_PRICES[p][cycle])}/{cycle === "anual" ? "ano" : "mês"}</small>
              </label>
            ))}
          </div>
          <div className="s-toggle s-toggle-left" role="group" aria-label="Ciclo de cobrança">
            <button type="button" aria-pressed={cycle === "mensal"} onClick={() => setCycle("mensal")}>Mensal</button>
            <button type="button" aria-pressed={cycle === "anual"} onClick={() => setCycle("anual")}>
              Anual <small>2 meses grátis</small>
            </button>
          </div>
          {expectFounder && (
            <p className="s-founder">
              Fundador: <strong>{brl(FOUNDER_PRICE_CENTS)}/mês</strong> para sempre · restam {founderLeft} de 10
            </p>
          )}
        </fieldset>

        <Field label="Nome do restaurante" error={show("restaurantName")}>
          <input name="restaurantName" autoComplete="organization" value={values.restaurantName} maxLength={80}
            onChange={(e) => set("restaurantName", e.target.value)} onBlur={() => blur("restaurantName")} />
        </Field>
        <Field label="Seu nome" error={show("ownerName")}>
          <input name="ownerName" autoComplete="name" value={values.ownerName} maxLength={80}
            onChange={(e) => set("ownerName", e.target.value)} onBlur={() => blur("ownerName")} />
        </Field>
        <div className="s-two">
          <Field label="E-mail" error={show("email")}>
            <input name="email" type="email" autoComplete="email" inputMode="email" value={values.email} maxLength={254}
              onChange={(e) => set("email", e.target.value)} onBlur={() => blur("email")} />
          </Field>
          <Field label="WhatsApp" error={show("phone")}>
            <input name="phone" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="(11) 99999-0000" value={values.phone}
              onChange={(e) => set("phone", formatPhone(e.target.value))} onBlur={() => blur("phone")} />
          </Field>
        </div>
        <div className="s-two">
          <Field label="CPF ou CNPJ" error={show("document")}>
            <input name="document" inputMode="numeric" autoComplete="off" value={values.document}
              onChange={(e) => set("document", formatDocument(e.target.value))} onBlur={() => blur("document")} />
          </Field>
          <Field label="Senha" error={show("password")} hint="Mínimo de 8 caracteres">
            <input name="password" type="password" autoComplete="new-password" value={values.password} maxLength={128}
              onChange={(e) => set("password", e.target.value)} onBlur={() => blur("password")} />
          </Field>
        </div>
        <div className="s-terms">
          <label>
            <input type="checkbox" checked={values.acceptTerms} onChange={(e) => { set("acceptTerms", e.target.checked); blur("acceptTerms"); }} />
            <span>Li e aceito a <Link href="/privacidade" target="_blank">Política de Privacidade</Link>.</span>
          </label>
          {show("acceptTerms") && <p className="s-error" role="alert">{show("acceptTerms")}</p>}
        </div>
      </form>

      <aside className="s-summary" aria-label="Resumo">
        <h2>Resumo</h2>
        <dl>
          <div><dt>Plano {PLAN_NAMES[plan]}</dt><dd>{brl(monthlyOrYearly)}</dd></div>
          <div><dt>Implantação (única)</dt><dd>{brl(SETUP_FEE_CENTS)}</dd></div>
          <div className="s-total"><dt>1º pagamento</dt><dd>{brl(total)}</dd></div>
        </dl>
        <p className="s-summary-note">Depois: {brl(monthlyOrYearly)}/{cycle === "anual" ? "ano" : "mês"}. Cancele quando quiser.</p>

        {formError && (
          <p className="s-alert" role="alert">
            <AlertCircle size={17} />
            <span>
              {formError.text}{" "}
              {formError.login && <Link href="/login">Entrar</Link>}
              {notice && !notice.text && <Link href={notice.href}>Ir para a gestão</Link>}
            </span>
          </p>
        )}
        {notice?.text && (
          <div className="s-alert s-alert-info" role="status">
            <Check size={17} />
            <span>
              {notice.text}
              <br />
              <button type="button" className="s-link-btn" onClick={() => { if (timer.current) clearTimeout(timer.current); go(notice.href); }}>
                Ir para o pagamento
              </button>
            </span>
          </div>
        )}

        <button type="submit" form={formId} className="s-btn s-btn-primary s-btn-block" disabled={busy || Boolean(notice)}>
          {busy ? <Loader2 className="s-spin" size={18} /> : null}
          {busy ? "Criando sua conta" : <>Ir para o pagamento <ArrowRight size={17} /></>}
        </button>
        <p className="s-secure"><ShieldCheck size={15} /> Pagamento seguro no Asaas · 30 dias de garantia</p>
      </aside>
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className={`s-field ${error ? "s-field-bad" : ""}`}>
      <span>{label}</span>
      {children}
      {error ? <em className="s-error" role="alert">{error}</em> : hint ? <em className="s-hint">{hint}</em> : null}
    </label>
  );
}
