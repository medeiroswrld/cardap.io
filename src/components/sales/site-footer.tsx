import Link from "next/link";

export function SiteFooter({ whatsappUrl }: { whatsappUrl?: string | null }) {
  return (
    <footer className="s-footer">
      <div className="s-wrap s-footer-row">
        <span>Fome Play · feito pela Amply</span>
        <nav aria-label="Rodapé">
          <Link href="/privacidade">Privacidade</Link>
          {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}
        </nav>
      </div>
    </footer>
  );
}
