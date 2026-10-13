"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Flame,
  Info,
  List,
  Search,
  ShoppingBag,
  Utensils,
  X,
} from "lucide-react";
import { ProductMedia } from "./product-media";
import { Modal } from "./ui/dialog";
import { money } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";

export function ImmersiveMenu({
  items,
  categories,
  category,
  choose,
  query,
  setQuery,
  name,
  demo,
  count,
  table,
  accepting,
  blocked,
  ready,
  onProduct,
  onBag,
  onInfo,
  onList,
}: {
  items: Product[];
  categories: Category[];
  category: string;
  choose: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
  name: string;
  demo: boolean;
  count: number;
  table: number;
  accepting: boolean;
  blocked: boolean;
  ready: boolean;
  onProduct: (product: Product) => void;
  onBag: () => void;
  onInfo: () => void;
  onList: () => void;
}) {
  const feed = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const tabs = [{ id: "todos", name: "Para você" }, ...categories];
  useEffect(() => {
    feed.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [category, query]);
  function selectCategory(id: string) {
    setActive(0);
    choose(id);
  }
  function sideways(direction: number) {
    const next = tabs[tabs.findIndex((tab) => tab.id === category) + direction];
    if (next) selectCategory(next.id);
  }
  function move(direction: number) {
    const element = feed.current;
    if (!element) return;
    element.scrollTo({
      top:
        (Math.round(element.scrollTop / element.clientHeight) + direction) *
        element.clientHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <main className="immersive-shell" inert={!ready}>
      <h1 className="reels-heading">Cardápio de {name}</h1>
      <div className="immersive-stage">
        <div
          className="immersive-feed"
          ref={feed}
          role="region"
          aria-label="Cardápio em reels"
          tabIndex={0}
          onScroll={(event) =>
            setActive(
              Math.round(
                event.currentTarget.scrollTop /
                  event.currentTarget.clientHeight,
              ),
            )
          }
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (
              ["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(event.key)
            ) {
              event.preventDefault();
              move(
                event.key === "ArrowDown" || event.key === "PageDown" ? 1 : -1,
              );
            } else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
              event.preventDefault();
              sideways(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
          onTouchStart={(event) => {
            if (
              event.touches.length !== 1 ||
              (event.target as HTMLElement).closest("button,a,input")
            ) {
              gesture.current = null;
              return;
            }
            gesture.current = {
              x: event.touches[0].clientX,
              y: event.touches[0].clientY,
            };
          }}
          onTouchCancel={() => {
            gesture.current = null;
          }}
          onTouchEnd={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (!start || !event.changedTouches[0]) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6)
              sideways(dx < 0 ? 1 : -1);
          }}
        >
          {items.length === 0 ? (
            <div className="immersive-empty">
              <Search size={28} />
              <h2>Nada por aqui ainda</h2>
              <p>Tente outro nome ou explore as categorias.</p>
              <button
                onClick={() => {
                  setQuery("");
                  selectCategory("todos");
                }}
              >
                Ver todo o cardápio
              </button>
            </div>
          ) : (
            items.map((product, index) => (
              <article
                className="immersive-reel"
                key={product.id}
                inert={index !== active}
                aria-hidden={index !== active}
                aria-label={`${product.name}, ${index + 1} de ${items.length}`}
              >
                <ProductMedia
                  key={product.video || product.image}
                  product={product}
                  autoPlay={index === active}
                  suspended={blocked || searchOpen}
                />
                <div className="immersive-shade" />
                <div className="immersive-caption">
                  <button className="immersive-restaurant" onClick={onInfo}>
                    <span>
                      <Flame size={16} />
                    </span>
                    {name}
                    <span className="immersive-dot">·</span>Mesa {table}
                  </button>
                  <button
                    className="immersive-product"
                    onClick={() => onProduct(product)}
                    aria-label={`Ver detalhes de ${product.name}`}
                  >
                    <h2>{product.name}</h2>
                    <p>{product.description}</p>
                    <span className="immersive-price">
                      {money(product.price)}{" "}
                      <span>
                        · {product.available ? "Ver prato" : "Indisponível"}
                      </span>
                    </span>
                  </button>
                  {!accepting && (
                    <span className="immersive-paused">Pedidos pausados</span>
                  )}
                </div>
                <div className="immersive-actions">
                  <button
                    onClick={() => onProduct(product)}
                    aria-label={`Ingredientes de ${product.name}`}
                  >
                    <Utensils size={25} />
                    <span>Prato</span>
                  </button>
                  <button
                    onClick={onBag}
                    aria-label={`Abrir sacola com ${count} itens`}
                  >
                    <span className="immersive-bag-icon">
                      <ShoppingBag size={27} />
                      {count > 0 && <b>{count}</b>}
                    </span>
                    <span>Sacola</span>
                  </button>
                  <button onClick={onInfo} aria-label="Sobre a casa">
                    <Info size={26} />
                    <span>A casa</span>
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <header className="immersive-header">
          <div>
            <strong>Cardápio</strong>
            {demo && <span className="immersive-demo">Demonstração</span>}
          </div>
          <div className="immersive-header-actions">
            <button
              aria-label="Buscar no cardápio"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={24} />
            </button>
            <button aria-label="Visualizar lista" onClick={onList}>
              <List size={25} />
            </button>
          </div>
        </header>
        {query && (
          <button
            className="immersive-query"
            onClick={() => {
              setQuery("");
              setActive(0);
            }}
          >
            “{query}” <X size={16} />
          </button>
        )}
        <nav
          className="immersive-categories"
          aria-label="Categorias do cardápio"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-pressed={category === tab.id}
              className={category === tab.id ? "active" : ""}
              onClick={() => selectCategory(tab.id)}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="immersive-desktop-controls">
        <button
          aria-label="Prato anterior"
          disabled={active === 0}
          onClick={() => move(-1)}
        >
          <ArrowUp size={24} />
        </button>
        <button
          aria-label="Próximo prato"
          disabled={active >= items.length - 1}
          onClick={() => move(1)}
        >
          <ArrowDown size={24} />
        </button>
      </div>
      <Modal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="O que você quer comer?"
      >
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            setSearchOpen(false);
          }}
        >
          <label className="form-label">
            Buscar no cardápio
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              placeholder="Nome ou ingrediente"
            />
          </label>
          <button className="button button-primary" type="submit">
            Ver resultados
          </button>
        </form>
      </Modal>
    </main>
  );
}
