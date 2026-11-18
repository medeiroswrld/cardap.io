import { ChevronDown } from "lucide-react";

export const FAQ_ITEMS = [
  { q: "Tem comissão?", a: "Não há comissão por pedido. Você paga o plano mensal e a implantação, que é um pagamento único." },
  { q: "Preciso de máquina ou app?", a: "Não. Funciona no navegador, no celular ou computador que você já tem." },
  { q: "Como recebo os pedidos?", a: "No painel, com aviso na tela. Dá para imprimir cada pedido." },
  { q: "Posso cancelar?", a: "Sim, quando quiser, pelo painel. O acesso segue até o fim do período pago." },
  { q: "O que é a implantação?", a: "Um pagamento único para deixar seu cardápio configurado e no ar. A implantação não é reembolsável." },
  { q: "Funciona com meu iFood?", a: "Você continua no iFood e leva o cliente a pedir direto no seu link, sem comissão. Não há integração com o iFood." },
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
