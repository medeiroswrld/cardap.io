"use client";
import { useState, type CSSProperties } from "react";
import { Button } from "./ui/button";
import { browserClient } from "@/lib/supabase/browser";
import { optimizePhoto } from "@/lib/photo-optimizer";
import type { Workspace } from "@/lib/connected-types";
import {
  BODY_FONTS,
  HEADING_FONTS,
  PRESETS,
  isReadable,
  resolveTheme,
  themeVariables,
  type MenuTheme,
  type PresetId,
} from "@/lib/menu-theme";

type Save = (body: unknown) => Promise<void>;
const COLOR_FIELDS = [
  ["brand", "Cor principal"],
  ["background", "Fundo"],
  ["surface", "Cartões"],
  ["text", "Texto"],
] as const;

export function MenuThemeSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [theme, setTheme] = useState<MenuTheme>(data.restaurant.menu_theme ?? {});
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<"" | "logo_url" | "cover_url">("");
  const resolved = resolveTheme(theme);
  const readable = isReadable(theme);
  const set = (patch: MenuTheme) => setTheme((t) => ({ ...t, ...patch }));
  const setColor = (patch: MenuTheme) => setTheme((t) => ({ ...t, ...patch, preset: "personalizado" }));

  async function upload(field: "logo_url" | "cover_url", file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(field);
    try {
      const photo = await optimizePhoto(file);
      const client = browserClient();
      const path = `${data.restaurant.id}/${crypto.randomUUID()}.${photo.type.split("/")[1]}`;
      const { error: uploadError } = await client.storage
        .from("restaurant-media")
        .upload(path, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw new Error("Não foi possível enviar a imagem. Tente novamente.");
      set({ [field]: client.storage.from("restaurant-media").getPublicUrl(path).data.publicUrl });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading("");
    }
  }

  async function submit(next: MenuTheme) {
    try {
      setError("");
      const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => typeof v === "string" && v !== ""));
      await save({ action: "menu_theme", theme: clean });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const without = (keys: (keyof MenuTheme)[]) =>
    setTheme((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !keys.includes(k as keyof MenuTheme))) as MenuTheme);

  return (
    <section className="admin-panel connected-panel form-stack menu-theme-settings">
      <h2>Aparência do cardápio</h2>
      <p className="field-help">
        Deixe o cardápio com a cara da sua marca. A gestão continua com o visual padrão.
      </p>

      <fieldset className="choice-group">
        <legend>Temas prontos</legend>
        <div className="theme-presets">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => {
            const p = PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                className={`theme-preset${theme.preset === id ? " active" : ""}`}
                style={{ background: p.background, color: p.text, borderColor: p.brand }}
                onClick={() => {
                  const { label: _label, ...values } = p;
                  void _label;
                  setTheme((t) => ({ logo_url: t.logo_url, cover_url: t.cover_url, ...values, preset: id }));
                }}
              >
                <span style={{ background: p.brand }} />
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="form-columns">
        <label className="form-label">
          Logo
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={(e) => void upload("logo_url", e.target.files?.[0])} />
        </label>
        <label className="form-label">
          Imagem de capa
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={(e) => void upload("cover_url", e.target.files?.[0])} />
        </label>
      </div>
      {uploading && <p role="status">Enviando imagem…</p>}
      <div className="connected-toolbar">
        {theme.logo_url && <Button type="button" variant="ghost" onClick={() => without(["logo_url"])}>Remover logo</Button>}
        {theme.cover_url && <Button type="button" variant="ghost" onClick={() => without(["cover_url"])}>Remover capa</Button>}
      </div>

      <fieldset className="choice-group">
        <legend>Tema</legend>
        <label className="checkbox-label">
          <input type="radio" name="mode" checked={resolved.mode === "light"} onChange={() => setColor({ mode: "light" })} /> Claro
        </label>
        <label className="checkbox-label">
          <input type="radio" name="mode" checked={resolved.mode === "dark"} onChange={() => setColor({ mode: "dark" })} /> Escuro
        </label>
      </fieldset>

      <div className="form-columns">
        {COLOR_FIELDS.map(([field, label]) => (
          <label key={field} className="form-label">
            {label}
            <input type="color" value={resolved[field]} onChange={(e) => setColor({ [field]: e.target.value.toLowerCase() })} />
          </label>
        ))}
      </div>

      <div className="form-columns">
        <label className="form-label">
          Fonte dos títulos
          <select value={resolved.heading_font} onChange={(e) => set({ heading_font: e.target.value as MenuTheme["heading_font"] })}>
            {Object.entries(HEADING_FONTS).map(([id, f]) => (
              <option key={id} value={id} style={{ fontFamily: f.family }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Fonte do texto
          <select value={resolved.body_font} onChange={(e) => set({ body_font: e.target.value as MenuTheme["body_font"] })}>
            {Object.entries(BODY_FONTS).map(([id, f]) => (
              <option key={id} value={id} style={{ fontFamily: f.family }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Cantos
          <select value={resolved.radius} onChange={(e) => set({ radius: e.target.value as MenuTheme["radius"] })}>
            <option value="reto">Retos</option>
            <option value="suave">Suaves</option>
            <option value="redondo">Bem arredondados</option>
          </select>
        </label>
      </div>

      <div
        className="theme-preview"
        style={{ ...themeVariables({ ...theme, mode: resolved.mode }), background: "var(--background)", color: "var(--text)" } as CSSProperties}
      >
        {theme.logo_url && <img className="brand-logo" src={theme.logo_url} alt="" />}
        <h3>Prévia do cardápio</h3>
        <div className="theme-preview-card">
          <strong>X-Burguer da casa</strong>
          <p>Pão brioche, blend 160 g, queijo e molho especial.</p>
          <span className="theme-preview-price">R$ 29,90</span>
          <span className="theme-preview-button">Adicionar</span>
        </div>
      </div>

      {!readable && (
        <p role="alert" className="form-error">
          O texto ficaria difícil de ler com essas cores. Ajuste o texto, o fundo ou os cartões.
        </p>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="connected-toolbar">
        <Button type="button" disabled={busy || !!uploading || !readable} onClick={() => void submit(theme)}>
          Salvar aparência
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !!uploading}
          onClick={() => {
            setTheme({});
            void submit({});
          }}
        >
          Voltar ao padrão
        </Button>
      </div>
    </section>
  );
}
