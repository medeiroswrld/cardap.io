"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function SetupForm({ password = false }: { password?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget);
        try {
          const result = await fetch(
            password ? "/api/password" : "/api/onboarding",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(form)),
            },
          );
          const data = await result.json();
          if (!result.ok) throw new Error(data.error);
          router.push(password ? "/gestao" : `/gestao/${data.id}`);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {password ? (
        <label className="form-label">
          Nova senha
          <input
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
      ) : (
        <>
          <label className="form-label">
            Nome do restaurante
            <input name="name" required minLength={2} maxLength={80} />
          </label>
          <label className="form-label">
            Endereço do cardápio
            <input
              name="slug"
              required
              pattern="[a-z0-9-]{3,60}"
              placeholder="meu-restaurante"
            />
            <small>
              Use letras minúsculas, números e hífens. O restaurante começa com
              pedidos pausados.
            </small>
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy
          ? "Salvando…"
          : password
            ? "Salvar nova senha"
            : "Criar meu restaurante"}
      </Button>
    </form>
  );
}
