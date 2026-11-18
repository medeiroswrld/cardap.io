import { ShieldCheck } from "lucide-react";

export function Guarantee() {
  return (
    <section className="s-section" aria-label="Garantia">
      <div className="s-wrap">
        <div className="s-guarantee">
          <ShieldCheck size={44} strokeWidth={1.6} />
          <div>
            <h2>30 dias de garantia</h2>
            <p>Não gostou em 30 dias? Devolvemos a mensalidade.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
