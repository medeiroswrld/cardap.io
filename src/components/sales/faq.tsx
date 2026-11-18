import { ChevronDown } from "lucide-react";

export const FAQ_ITEMS = [
  { q: "Tem comissão?", a: "Não. Você paga só a mensalidade, sem taxa por pedido." },
  { q: "Preciso de máquina ou app?", a: "Não. Funciona no navegador, no celular ou computador que você já tem." },
  { q: "Como recebo os pedidos?", a: "No painel, com aviso na tela. Dá para imprimir cada pedido." },
  { q: "Posso cancelar?", a: "Sim, quando quiser, pelo painel. O acesso segue até o fim do período pago." },
  { q: "O que é a implantação?", a: "Um pagamento único para deixar seu cardápio configurado e no ar." },
  { q: "Funciona com meu iFood?", a: "Sim. Você mantém o iFood e leva o cliente a pedir direto no seu link." },
];

export function Faq() {
  return (
    <section className="s-section" aria-labelledby="faq-title">
      <div className="s-wrap s-narrow">
        <h2 id="faq-title" className="s-title">Perguntas</h2>
        <div className="s-faq">
          {FAQ_ITEMS.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}<ChevronDown size={18} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
