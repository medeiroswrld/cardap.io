import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, Play, Share2 } from "lucide-react";

export function Hero() {
  return (
    <section className="s-hero">
      <div className="s-wrap s-hero-grid">
        <div className="s-hero-copy">
          <h1>O cardápio que traz seu cliente <span>de volta.</span></h1>
          <p className="s-lead">Cardápio em vídeo, reconquista de clientes e financeiro. Sem comissão por pedido.</p>
          <div className="s-actions">
            <a className="s-btn s-btn-primary" href="#planos">Ver planos <ArrowRight size={17} /></a>
            <Link className="s-btn s-btn-ghost" href="/r/demo"><Play size={16} /> Ver demonstração</Link>
          </div>
        </div>
        <div className="s-hero-visual" aria-hidden="true">
          <div className="s-phone">
            <Image src="/images/burger.jpg" alt="" fill priority sizes="(max-width: 700px) 70vw, 300px" className="s-phone-img" />
            <div className="s-phone-shade" />
            <div className="s-phone-bars"><i className="on" /><i /><i /><i /></div>
            <div className="s-phone-side"><span><Heart size={20} /></span><span><Share2 size={20} /></span></div>
            <div className="s-phone-info">
              <strong>Smash duplo</strong>
              <span>R$ 32,90</span>
              <b>Pedir agora</b>
            </div>
          </div>
          <div className="s-chip s-chip-a"><b>0%</b> de comissão</div>
          <div className="s-chip s-chip-b">Pedido direto</div>
        </div>
      </div>
    </section>
  );
}
