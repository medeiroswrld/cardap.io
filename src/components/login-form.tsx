"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "recover" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <main className="login-page">
      <div className="login-brand-panel">
        <Brand />
        <div>
          <h1>
            Boa comida.
            <br />
            Boa gestão.
            <br />
            Uma casa cheia
            <br />
            de possibilidades.
          </h1>
          <p>
            Seu cardápio, seus pedidos e seus clientes.
            <br />
            Tudo no mesmo lugar.
          </p>
        </div>
        <span>Do primeiro olhar à última mordida.</span>
      </div>
      <div className="login-form-panel">
        <Link className="login-back" href="/r/demo">
          ← Voltar ao cardápio
        </Link>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const form = new FormData(e.currentTarget);
            try {
              const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: mode,
                  email: form.get("email"),
                  ...(mode !== "recover"
                    ? { password: form.get("password") }
                    : {}),
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              if (mode === "login") {
                router.push("/gestao");
                router.refresh();
              } else
                setMessage(
                  mode === "signup"
                    ? "Confira seu e-mail para confirmar a conta."
                    : data.message,
                );
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <LockKeyhole size={27} />
          <div>
            <h2>
              {mode === "login"
                ? "Entrar na gestão"
                : mode === "signup"
                  ? "O próximo capítulo da sua casa."
                  : "Vamos recuperar seu acesso."}
            </h2>
            <p>
              {mode === "login"
                ? "Entre para cuidar do seu restaurante."
                : mode === "signup"
                  ? "Crie a conta do responsável pelo restaurante."
                  : "Informe o e-mail da sua conta."}
            </p>
          </div>
          {!configured && (
            <div className="notice small">
              O ambiente conectado aguarda configuração do Supabase. A
              demonstração já pode ser explorada.
            </div>
          )}
          <label className="form-label">
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@restaurante.com.br"
            />
          </label>
          {mode !== "recover" && (
            <label className="form-label">
              Senha
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                placeholder="Pelo menos 8 caracteres"
              />
            </label>
          )}
          {mode === "login" && (
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setMode("recover");
                setMessage("");
              }}
            >
              Esqueci minha senha
            </button>
          )}
          {message && (
            <p className="notice small" role="status">
              {message}
            </p>
          )}
          <Button type="submit" disabled={!configured || busy}>
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? "Entrar no restaurante"
                : mode === "signup"
                  ? "Criar conta"
                  : "Enviar instruções"}
            <ArrowRight size={16} />
          </Button>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
            }}
          >
            {mode === "login"
              ? "Ainda não tem conta? Cadastre seu restaurante"
              : "Já tem uma conta? Voltar para entrar"}
          </button>
          <div className="login-demo">
            <p>Quer conhecer primeiro?</p>
            <Link className="button button-outline full-width" href="/r/demo">
              Ver cardápio de demonstração
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
