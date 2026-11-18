"use client";
import { useState } from "react";
import { MAX_COMMISSION, MIN_COMMISSION, ifoodSavings } from "@/lib/plans";
import { brl } from "@/lib/sales";

export function SavingsCalculator() {
  const [reais, setReais] = useState(10000);
  const [percent, setPercent] = useState(27);
  const savings = ifoodSavings(reais * 100, percent);
  return (
    <section className="s-section" aria-labelledby="calc-title">
      <div className="s-wrap">
        <div className="s-calc">
          <div className="s-calc-form">
            <h2 id="calc-title">Quanto você vende por mês no iFood?</h2>
            <label className="s-field">
              <span>Vendas por mês</span>
              <span className="s-money">
                <em>R$</em>
                <input
                  inputMode="numeric"
                  value={reais ? reais.toLocaleString("pt-BR") : ""}
                  placeholder="0"
                  onChange={(e) => setReais(Math.min(9_999_999, Number(e.target.value.replace(/\D/g, "")) || 0))}
                />
              </span>
            </label>
            <label className="s-field">
              <span>Comissão do iFood <strong>{percent}%</strong></span>
              <input
                className="s-range"
                type="range"
                min={MIN_COMMISSION}
                max={MAX_COMMISSION}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="s-calc-result" aria-live="polite">
            <span>Pedindo direto, você economiza até</span>
            <strong>{brl(savings)}</strong>
            <span>por mês</span>
          </div>
        </div>
      </div>
    </section>
  );
}
