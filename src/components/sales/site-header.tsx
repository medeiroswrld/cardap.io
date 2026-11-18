import Link from "next/link";
import { Flame } from "lucide-react";
import { ModeToggle } from "../mode-toggle";
import { AuthLink } from "./auth-link";

export function SiteHeader({ plain = false }: { plain?: boolean }) {
  return (
    <header className="s-header">
      <div className="s-wrap s-header-row">
        <Link href="/" className="s-logo" aria-label="Fome Play — início">
          <span className="s-logo-icon"><Flame size={20} strokeWidth={2} /></span>
          <span>fome play</span>
        </Link>
        <nav className="s-nav" aria-label="Principal">
          {!plain && <Link className="s-nav-link s-hide-sm" href="/r/demo">Ver demonstração</Link>}
          <AuthLink className="s-nav-link" />
          <ModeToggle compact />
        </nav>
      </div>
    </header>
  );
}
