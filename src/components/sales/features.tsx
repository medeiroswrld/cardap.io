import { Clapperboard, HeartHandshake, Percent, WalletCards } from "lucide-react";

const ITEMS = [
  { icon: Clapperboard, title: "Cardápio em vídeo", text: "Cada prato em tela cheia, como nos reels." },
  { icon: Percent, title: "Sem comissão", text: "O pedido é seu. Você paga só a mensalidade." },
  { icon: HeartHandshake, title: "Cliente de volta", text: "Cupons e reconquista de quem sumiu." },
  { icon: WalletCards, title: "Resultado em reais", text: "Financeiro e relatórios claros." },
];

export function Features() {
  return (
    <section className="s-section" aria-labelledby="features-title">
      <h2 id="features-title" className="sr-only">Por que o Fome Play</h2>
      <div className="s-wrap s-features">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <div className="s-feature" key={title}>
            <span className="s-feature-icon"><Icon size={22} strokeWidth={1.9} /></span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
