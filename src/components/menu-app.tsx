"use client";
import { OrderChoices } from "./order-choices";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Flame,
  Hamburger,
  IceCreamBowl,
  Info,
  Clapperboard,
  List,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Soup,
  Sparkles,
  Utensils,
  GlassWater,
  X,
} from "lucide-react";
import { useDemo } from "./demo-provider";
import { Brand, DemoBanner } from "./brand";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { ProductMedia } from "./product-media";
import { ImmersiveMenu } from "./immersive-menu";
import { ProductFeedbackModal } from "./product-feedback";
import { money } from "@/lib/utils";
import type { Product } from "@/lib/types";
const categoryIcons: Record<string, typeof Hamburger> = {
  burger: Hamburger,
  fries: Soup,
  drink: GlassWater,
  dessert: IceCreamBowl,
};
export function MenuApp() {
  const { state, ready, add, notify, mode, slug } = useDemo();
  const [category, setCategory] = useState("todos");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"feed" | "list">("feed");
  const [selected, setSelected] = useState<Product | null>(null);
  const [feedbackProduct, setFeedbackProduct] = useState<Product | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [table, setTable] = useState(mode === "demo" ? 4 : 1);
  const feedRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [category, query, view]);
  function moveReel(direction: number) {
    const feed = feedRef.current;
    if (!feed) return;
    const index = Math.round(feed.scrollTop / feed.clientHeight);
    feed.scrollTo({
      top: (index + direction) * feed.clientHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  useEffect(() => {
    queueMicrotask(() => {
      const value = Number(
        new URLSearchParams(window.location.search).get("mesa"),
      );
      if (value > 0 && Number.isInteger(value)) setTable(value);
    });
  }, []);
  const categories = state.categories.filter(
    (c) =>
      c.visible &&
      state.products.some((p) => p.categoryId === c.id && p.published),
  );
  const items = state.products.filter(
    (p) =>
      p.published &&
      categories.some((c) => c.id === p.categoryId) &&
      (category === "todos" || p.categoryId === category) &&
      `${p.name} ${p.description}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")),
  );
  const count = state.bag.reduce((sum, i) => sum + i.quantity, 0);
  const total = state.bag.reduce((sum, i) => sum + i.quantity * i.price, 0);
  const choose = (id: string) => {
    setCategory(id);
    requestAnimationFrame(() =>
      document
        .querySelector(".mobile-categories .category-button.active")
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
    feedRef.current?.scrollTo({ top: 0, behavior: "instant" });
  };
  const quickAdd = (p: Product) => {
    if (p.removableIngredients?.length || p.addOns?.length) {
      setSelected(p);
      return;
    }
    try {
      add({ productId: p.id, quantity: 1, note: "", price: p.price });
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const categoryButtons = (
    <>
      <button
        className={`category-button ${category === "todos" ? "active" : ""}`}
        onClick={() => choose("todos")}
      >
        <Utensils size={21} />
        <span>Para você</span>
        <ChevronRight size={16} />
      </button>
      {categories.map((c) => {
        const Icon = categoryIcons[c.icon] || Utensils;
        return (
          <button
            key={c.id}
            className={`category-button ${category === c.id ? "active" : ""}`}
            onClick={() => choose(c.id)}
          >
            <Icon size={21} />
            <span>{c.name}</span>
            <ChevronRight size={16} />
          </button>
        );
      })}
    </>
  );
  const regularCatalog = (
    <>
      <DemoBanner />
      <header className="customer-header">
        <Brand />
        <nav className="header-nav" aria-label="Principal">
          <Link href={`/r/${slug}`} className="current">
            Cardápio
          </Link>
          <Link href={`/r/${slug}/pedidos`}>Meus pedidos</Link>
        </nav>
        <div className="header-actions">
          {view === "feed" && (
            <button
              className="reels-house-info"
              aria-label="Sobre a casa"
              onClick={() => setInfoOpen(true)}
            >
              <Info size={20} />
            </button>
          )}
          <button className="table-pill" onClick={() => setInfoOpen(true)}>
            <MapPin size={16} />
            <span>Mesa {String(table).padStart(2, "0")}</span>
            <ChevronDown size={14} />
          </button>
          <button
            className="mobile-bag button button-icon button-outline"
            aria-label={`Abrir sacola com ${count} itens`}
            onClick={() => setBagOpen(true)}
          >
            <ShoppingBag size={21} />
            {count > 0 && <span className="count-dot">{count}</span>}
          </button>
        </div>
      </header>
      <main className="menu-main">
        {view === "feed" && (
          <h1 className="reels-heading">Cardápio de {state.settings.name}</h1>
        )}
        {view === "list" && (
          <div className="menu-intro">
            <div>
              <div className="open-label">
                <span
                  className={
                    state.settings.accepting ? "open-dot" : "closed-dot"
                  }
                />
                {state.settings.accepting
                  ? "A casa está aberta"
                  : "Pedidos pausados"}
                <span className="intro-dot">·</span>
                <span>Feito na hora, pra você</span>
              </div>
              <h1>
                Deu fome?{" "}
                <span>
                  {mode === "demo"
                    ? "Deixa com a Brasa."
                    : `Escolha no ${state.settings.name}.`}
                </span>
              </h1>
              <p>Conheça os sabores da casa. Seu próximo favorito está aqui.</p>
            </div>
            <button
              className="restaurant-info"
              onClick={() => setInfoOpen(true)}
            >
              <Info size={17} /> Sobre a casa
            </button>
          </div>
        )}
        {!state.settings.accepting && (
          <div className="notice">
            <Clock3 size={18} />
            Estamos com os pedidos pausados. Você pode continuar explorando o
            cardápio.
          </div>
        )}
        <div className="menu-workspace">
          <aside className="menu-left">
            <div className="category-heading">O que vai ser hoje?</div>
            <nav className="desktop-categories" aria-label="Categorias">
              {categoryButtons}
            </nav>
            <div className="house-note">
              <Flame size={25} />
              <h3>
                Da nossa brasa.
                <br />
                Do seu jeito.
              </h3>
              <p>Ingredientes de verdade e cuidado em cada pedido.</p>
              <span>Preparado aqui, na hora.</span>
            </div>
            <button className="news-link" onClick={() => setNewsOpen(true)}>
              <Sparkles size={17} />
              <span>Receber novidades</span>
              <ArrowRight size={15} />
            </button>
            <div className="powered-by">
              Cardápio feito para abrir o apetite.
            </div>
          </aside>
          <section className="menu-center" aria-label="Produtos">
            <div className="menu-toolbar">
              <label className="search-field">
                <Search size={19} />
                <input
                  aria-label="Buscar no cardápio"
                  placeholder="Qual é a sua vontade?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Limpar busca"
                    onClick={() => setQuery("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </label>
              <div className="view-switch" aria-label="Modo de visualização">
                <button
                  className={view === "feed" ? "active" : ""}
                  aria-label="Visualizar feed"
                  aria-pressed={view === "feed"}
                  onClick={() => setView("feed")}
                >
                  <Clapperboard size={18} />
                </button>
                <button
                  className={view === "list" ? "active" : ""}
                  aria-label="Visualizar lista"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  <List size={19} />
                </button>
              </div>
            </div>
            <div className="feed-meta">
              <span>
                {query
                  ? `Resultados para “${query}”`
                  : category === "todos"
                    ? "Escolhas que dão água na boca"
                    : categories.find((c) => c.id === category)?.name}
              </span>
              <span>{items.length} opções</span>
            </div>
            <div
              ref={feedRef}
              className={view === "feed" ? "product-feed" : "product-list"}
              role="region"
              aria-label={
                view === "feed" ? "Cardápio em reels" : "Cardápio em lista"
              }
              tabIndex={view === "feed" ? 0 : undefined}
              onScroll={
                view === "feed"
                  ? (event) => {
                      const feed = event.currentTarget;
                      setActiveIndex(
                        Math.round(feed.scrollTop / feed.clientHeight),
                      );
                    }
                  : undefined
              }
              onKeyDown={
                view === "feed"
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (
                        ["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(
                          event.key,
                        )
                      ) {
                        event.preventDefault();
                        moveReel(
                          event.key === "ArrowDown" || event.key === "PageDown"
                            ? 1
                            : -1,
                        );
                      }
                    }
                  : undefined
              }
            >
              {items.length === 0 ? (
                <div className="empty-state">
                  <Search size={32} />
                  <h2>Nada por aqui ainda</h2>
                  <p>Tente outro nome ou explore todas as categorias.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      choose("todos");
                    }}
                  >
                    Ver todo o cardápio
                  </Button>
                </div>
              ) : (
                items.map((p, index) => (
                  <article
                    key={p.id}
                    className={`food-card ${!p.available ? "unavailable" : ""}`}
                    aria-label={`${p.name}, ${index + 1} de ${items.length}`}
                  >
                    <div className="food-visual">
                      <ProductMedia key={p.video || p.image} product={p} />
                      {view === "feed" && (
                        <>
                          <div className="food-image-shade" />
                          <div className="food-top-label">
                            {p.tag ? (
                              <span className="food-tag">
                                <Flame size={14} />
                                {p.tag}
                              </span>
                            ) : (
                              <span className="food-tag">
                                {
                                  categories.find((c) => c.id === p.categoryId)
                                    ?.name
                                }
                              </span>
                            )}
                            <button
                              className="image-info"
                              aria-label={`Ver detalhes de ${p.name}`}
                              onClick={() => setSelected(p)}
                            >
                              <Info size={19} />
                            </button>
                          </div>
                          <div className="food-image-caption">
                            <span>
                              {
                                categories.find((c) => c.id === p.categoryId)
                                  ?.name
                              }
                            </span>
                            <h2>{p.name}</h2>
                            <p>{p.description}</p>
                            <button onClick={() => setSelected(p)}>
                              Conhecer os ingredientes{" "}
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="food-bottom">
                      {view === "list" && (
                        <div className="list-product-info">
                          <h2>
                            <button onClick={() => setSelected(p)}>
                              {p.name}
                            </button>
                          </h2>
                          <p>{p.description}</p>
                        </div>
                      )}
                      <div className="price-block">
                        <span>
                          {p.available ? "Feito na hora" : "Volta em breve"}
                        </span>
                        <strong>{money(p.price)}</strong>
                      </div>
                      <Button
                        disabled={
                          !ready || !p.available || !state.settings.accepting
                        }
                        onClick={() => quickAdd(p)}
                        aria-label={`Adicionar ${p.name}`}
                      >
                        <Plus size={18} />
                        <span>
                          {p.available ? "Adicionar" : "Indisponível"}
                        </span>
                      </Button>
                    </div>
                    {view === "feed" && (
                      <div className="feed-card-footer">
                        <span>
                          <ArrowDown size={14} />{" "}
                          {index < items.length - 1
                            ? "Deslize para ver mais"
                            : "Você viu todos os pratos"}
                        </span>
                        <span>
                          {String(index + 1).padStart(2, "0")} /{" "}
                          {String(items.length).padStart(2, "0")}
                        </span>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
            {view === "feed" && items.length > 1 && (
              <button
                className="scroll-hint"
                aria-label="Próximo prato"
                disabled={activeIndex >= items.length - 1}
                onClick={() => moveReel(1)}
              >
                <ArrowDown size={20} /> <span>Próximo prato</span>
              </button>
            )}
          </section>
          <aside className="bag-aside">
            <Bag onCheckout={() => setCheckoutOpen(true)} />
            <div className="payment-note">
              <Check size={16} />
              <span>Peça por aqui. Pague no local.</span>
            </div>
            <div className="table-service">
              <Utensils size={17} />
              <div>
                <strong>
                  Você está na mesa {String(table).padStart(2, "0")}
                </strong>
                <p>A gente leva o pedido até você.</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <nav className="mobile-categories" aria-label="Categorias do cardápio">
        {categoryButtons}
      </nav>
      {count > 0 && (
        <button className="floating-bag" onClick={() => setBagOpen(true)}>
          <span>
            <span className="bag-count">{count}</span> Ver minha sacola
          </span>
          <strong>
            {money(total)} <ChevronRight size={16} />
          </strong>
        </button>
      )}
    </>
  );
  return (
    <div
      className={`customer-app ${view === "feed" ? "reels-mode" : "list-mode"}`}
    >
      {view === "feed" ? (
        <ImmersiveMenu
          ready={ready}
          items={items}
          categories={categories}
          category={category}
          choose={choose}
          query={query}
          setQuery={setQuery}
          name={state.settings.name}
          demo={mode === "demo"}
          count={count}
          table={table}
          accepting={state.settings.accepting}
          blocked={
            !!selected ||
            !!feedbackProduct ||
            bagOpen ||
            checkoutOpen ||
            infoOpen ||
            newsOpen
          }
          onProduct={setSelected}
          onBag={() => setBagOpen(true)}
          onInfo={() => setInfoOpen(true)}
          onList={() => setView("list")}
          onFeedback={setFeedbackProduct}
        />
      ) : (
        regularCatalog
      )}
      <ProductFeedbackModal
        restaurantId={feedbackProduct?.restaurantId || ""}
        product={feedbackProduct}
        onClose={() => setFeedbackProduct(null)}
      />
      <Modal open={bagOpen} onOpenChange={setBagOpen} title="Sua sacola">
        <Bag
          inModal
          onCheckout={() => {
            setBagOpen(false);
            setCheckoutOpen(true);
          }}
        />
      </Modal>
      <Modal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        title="Falta pouco para matar a fome"
        description="Confira seus dados. O pagamento é feito no local."
      >
        <Checkout table={table} />
      </Modal>
      <Modal
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title={selected?.name || "Produto"}
        description="Conheça os ingredientes e deixe o pedido do seu jeito."
      >
        {selected?.restaurantId && selected.feedbackEnabled !== false && (
          <button
            className="button button-outline"
            onClick={() => {
              setFeedbackProduct(selected);
              setSelected(null);
            }}
          >
            Curtidas e comentários
          </button>
        )}
        {selected && (
          <ProductDetail
            key={selected.id}
            product={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>
      <Modal
        open={infoOpen}
        onOpenChange={setInfoOpen}
        title={`Bem-vindo ao ${state.settings.name}`}
        description="Uma casa de burgers, bons ingredientes e boas escolhas."
      >
        <div className="info-lines">
          <p>
            <MapPin size={20} />
            {state.settings.address}
          </p>
          <p>
            <Clock3 size={20} />
            {state.settings.hours}
          </p>
          <p>
            <Utensils size={20} />
            Atendimento na mesa • pagamento no local
          </p>
        </div>
        <label className="form-label">
          Sua mesa
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
        <p className="field-help">
          Confira o número indicado na sua mesa antes de pedir.
        </p>
        <Button className="full-width" onClick={() => setInfoOpen(false)}>
          Continuar no cardápio
        </Button>
        <div className="restaurant-quick-links">
          <Link href={`/r/${slug}/pedidos`}>Meus pedidos</Link>
          <button
            onClick={() => {
              setInfoOpen(false);
              setNewsOpen(true);
            }}
          >
            Receber novidades
          </button>
          <Link
            href={mode === "demo" ? "/privacidade" : `/r/${slug}/privacidade`}
          >
            Privacidade
          </Link>
        </div>
      </Modal>
      <Modal
        open={newsOpen}
        onOpenChange={setNewsOpen}
        title="Um lugar para as boas novidades"
        description={`Escolha receber novidades e ofertas do ${state.settings.name}.`}
      >
        <Newsletter onComplete={() => setNewsOpen(false)} />
      </Modal>
    </div>
  );
}
export function Bag({
  onCheckout,
  inModal = false,
}: {
  onCheckout: () => void;
  inModal?: boolean;
}) {
  const { state, update, notify, ready } = useDemo();
  const count = state.bag.reduce((s, i) => s + i.quantity, 0);
  const total = state.bag.reduce((s, i) => s + i.quantity * i.price, 0);
  const change = (index: number, delta: number) => {
    try {
      update((s) => ({
        ...s,
        bag: s.bag
          .map((b, i) =>
            i === index
              ? { ...b, quantity: Math.min(20, b.quantity + delta) }
              : b,
          )
          .filter((b) => b.quantity > 0),
      }));
    } catch {
      notify("Não foi possível atualizar a sacola. Tente novamente.");
    }
  };
  return (
    <div className={`bag-panel ${inModal ? "bag-modal" : ""}`}>
      {!inModal && (
        <div className="bag-heading">
          <h2>
            <ShoppingBag size={20} />
            Sua sacola
          </h2>
          <span>
            {count} {count === 1 ? "item" : "itens"}
          </span>
        </div>
      )}
      {!count ? (
        <div className="bag-empty">
          <div className="empty-bag-icon">
            <ShoppingBag size={35} strokeWidth={1.25} />
            <span>+</span>
          </div>
          <h3>
            Uma boa escolha
            <br />
            começa por aqui.
          </h3>
          <p>
            Adicione seus favoritos e deixe
            <br />o resto com a gente.
          </p>
          <span className="empty-bag-line" />
        </div>
      ) : (
        <div className="bag-items">
          {state.bag.map((item, i) => {
            const p = state.products.find((p) => p.id === item.productId);
            return (
              <div key={`${item.productId}-${i}`} className="bag-item">
                <img src={p?.image || "/images/burger.jpg"} alt="" />
                <div>
                  <strong>{p?.name || "Produto removido"}</strong>
                  <span>{money(item.price)}</span>
                  <OrderChoices
                    removed={item.removedIngredients}
                    additions={item.addOns}
                  />
                  {item.note && <small>{item.note}</small>}
                  <div className="quantity-control">
                    <button
                      aria-label={`Diminuir ${p?.name}`}
                      onClick={() => change(i, -1)}
                    >
                      <Minus size={13} />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      aria-label={`Aumentar ${p?.name}`}
                      disabled={item.quantity >= 20}
                      onClick={() => change(i, 1)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <button
                  className="remove-item"
                  aria-label={`Remover ${p?.name}`}
                  onClick={() => change(i, -item.quantity)}
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="bag-summary">
        <div>
          <span>Subtotal</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="total-row">
          <span>Total do pedido</span>
          <strong>{money(total)}</strong>
        </div>
        <Button
          className="full-width"
          disabled={!count || !ready || !state.settings.accepting}
          onClick={onCheckout}
        >
          Revisar pedido <ArrowRight size={17} />
        </Button>
        <p>Sem taxa de serviço adicionada por aqui.</p>
      </div>
    </div>
  );
}
function ProductDetail({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const { add, notify, state } = useDemo();
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [removed, setRemoved] = useState<string[]>([]);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const additions = (product.addOns || []).filter((o) =>
    optionIds.includes(o.id),
  );
  const unitPrice =
    product.price + additions.reduce((sum, o) => sum + o.price_cents, 0);
  return (
    <div className="product-detail">
      <img src={product.image} alt={product.name} />
      <p>{product.ingredients}</p>
      <div className="allergen-note">
        <Info size={16} />
        {product.allergens}
      </div>
      {!!product.removableIngredients?.length && (
        <fieldset className="choice-group">
          <legend>Ingredientes incluídos</legend>
          <p className="field-help">
            Desmarque o que deseja retirar. O preço permanece o mesmo.
          </p>
          {product.removableIngredients.map((name) => (
            <label className="choice-row" key={name}>
              <input
                type="checkbox"
                checked={!removed.includes(name)}
                onChange={(e) =>
                  setRemoved(
                    e.target.checked
                      ? removed.filter((v) => v !== name)
                      : [...removed, name],
                  )
                }
              />
              <span>{name}</span>
              <small>{removed.includes(name) ? "Retirar" : "Incluído"}</small>
            </label>
          ))}
        </fieldset>
      )}
      {!!product.addOns?.length && (
        <fieldset className="choice-group">
          <legend>Adicionais opcionais</legend>
          <p className="field-help">
            Marque o que quiser acrescentar. Valores por unidade.
          </p>
          {product.addOns.map((o) => (
            <label className="choice-row" key={o.id}>
              <input
                type="checkbox"
                checked={optionIds.includes(o.id)}
                disabled={optionIds.length >= 30 && !optionIds.includes(o.id)}
                onChange={(e) =>
                  setOptionIds(
                    e.target.checked
                      ? [...optionIds, o.id]
                      : optionIds.filter((id) => id !== o.id),
                  )
                }
              />
              <span>{o.name}</span>
              <small>
                {o.price_cents ? "+ " + money(o.price_cents) : "Grátis"}
              </small>
            </label>
          ))}
        </fieldset>
      )}
      <label className="form-label">
        Alguma observação?
        <textarea
          maxLength={300}
          placeholder="Ex.: sem cebola, por favor."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="product-detail-footer">
        <div className="quantity-control large">
          <button
            aria-label="Diminuir quantidade"
            disabled={quantity === 1}
            onClick={() => setQuantity(quantity - 1)}
          >
            <Minus size={16} />
          </button>
          <strong>{quantity}</strong>
          <button
            aria-label="Aumentar quantidade"
            disabled={quantity === 20}
            onClick={() => setQuantity(quantity + 1)}
          >
            <Plus size={16} />
          </button>
        </div>
        <Button
          disabled={!product.available || !state.settings.accepting}
          onClick={() => {
            try {
              add({
                productId: product.id,
                quantity,
                note,
                price: unitPrice,
                removedIngredients: removed,
                addOns: additions.map(({ id, name, price_cents }) => ({
                  id,
                  name,
                  price_cents,
                })),
              });
              onClose();
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          {product.available
            ? `Adicionar • ${money(unitPrice * quantity)}`
            : "Indisponível"}
        </Button>
      </div>
    </div>
  );
}
function Checkout({ table }: { table: number }) {
  const router = useRouter();
  const { state, checkout, mode, slug } = useDemo();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [chosenTable, setChosenTable] = useState(table);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef<string>("");
  const total = state.bag.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          if (!key.current) key.current = crypto.randomUUID();
          const order = await checkout({
            name,
            phone,
            table: chosenTable,
            consent,
            key: key.current,
          });
          router.push(`/r/${slug}/pedido/${order.id}`);
        } catch (error) {
          setError((error as Error).message);
          setBusy(false);
        }
      }}
    >
      {mode === "demo" && (
        <div className="notice small">
          Pedido de demonstração. Seus dados ficam apenas neste navegador. Use
          dados fictícios para testar.
        </div>
      )}
      <label className="form-label">
        Como podemos chamar você?
        <input
          required
          minLength={2}
          maxLength={80}
          autoComplete="given-name"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="form-columns">
        <label className="form-label">
          WhatsApp com DDD
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            pattern="[0-9()+\s-]{10,18}"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="form-label">
          Mesa
          <select
            value={chosenTable}
            onChange={(e) => setChosenTable(Number(e.target.value))}
          >
            {Array.from({ length: state.settings.tables }, (_, i) => (
              <option key={i} value={i + 1}>
                Mesa {String(i + 1).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="checkout-summary">
        {state.bag.map((i, index) => (
          <div key={index}>
            <span>
              {i.quantity}×{" "}
              {state.products.find((p) => p.id === i.productId)?.name}
              <OrderChoices
                removed={i.removedIngredients}
                additions={i.addOns}
              />
              {i.note && <small>{i.note}</small>}
            </span>
            <strong>{money(i.quantity * i.price)}</strong>
          </div>
        ))}
        <div className="total-row">
          <span>Total • pagamento no local</span>
          <strong>{money(total)}</strong>
        </div>
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Quero receber novidades e ofertas do {state.settings.name} no
          WhatsApp. Posso cancelar quando quiser.{" "}
          <small>Opcional. Isso não interfere no seu pedido.</small>
        </span>
      </label>
      <p className="privacy-note">
        Seu nome e WhatsApp serão usados para atender este pedido. O número
        informado não é verificado.{" "}
        <Link href="/privacidade">Entenda sua privacidade</Link>.
      </p>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      <Button type="submit" className="full-width" disabled={busy}>
        {busy
          ? "Salvando pedido…"
          : mode === "demo"
            ? "Enviar pedido de demonstração"
            : "Enviar pedido"}
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
function Newsletter({ onComplete }: { onComplete: () => void }) {
  const { subscribe, state, mode } = useDemo();
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        try {
          setBusy(true);
          await subscribe(
            String(data.get("name")),
            String(data.get("phone")),
            consent,
          );
          onComplete();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="form-label">
        Seu nome
        <input name="name" required minLength={2} maxLength={80} />
      </label>
      <label className="form-label">
        WhatsApp com DDD
        <input name="phone" type="tel" required pattern="[0-9()+\s-]{10,18}" />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          Quero receber novidades e ofertas do {state.settings.name} no
          WhatsApp. Posso cancelar quando quiser.
        </span>
      </label>
      <p className="field-help">
        {mode === "demo"
          ? "Demonstração local: nenhuma mensagem será enviada. Para revogar, use o painel de contatos da demonstração."
          : "Você pode revogar a autorização entrando em contato com o restaurante. O telefone informado não é verificado; preferências existentes são preservadas."}
      </p>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={!consent || busy}>
        Salvar minha preferência
      </Button>
    </form>
  );
}
