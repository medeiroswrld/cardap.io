import { hasOwnStyle, type MenuTheme } from "@/lib/menu-theme";

// Runs before the menu paints, so a restaurant with its own theme never
// flashes the Fome Play colors. useMenuTheme keeps the flag in sync afterwards.
export function OwnThemeFlag({ theme }: { theme?: MenuTheme | null }) {
  const code = hasOwnStyle(theme)
    ? 'document.documentElement.dataset.ownTheme="1"'
    : "delete document.documentElement.dataset.ownTheme";
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
