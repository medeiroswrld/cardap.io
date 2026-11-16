# C — Identidade visual (cardápio personalizável)

Data: 16/11/2026 · Aprovado pelo usuário no chat ("full personalizável") · Branch: `melhorias/piloto` · Migration: 018

## Objetivo
Cada restaurante deixa o cardápio com a cara da própria marca sem perder legibilidade. Escopo escolhido pelo usuário:
- logo e imagem de capa;
- cores completas com tema claro ou escuro;
- fontes de título e de texto;
- arredondamento dos cantos;
- temas prontos.

Fora de escopo: editar textos do cardápio (frases continuam fixas), personalizar a gestão e layouts diferentes.

## Modelo
Coluna `restaurants.menu_theme jsonb not null default '{}'`. Chave ausente significa "usar o padrão atual". Formato:

```json
{
  "preset": "brasa|pizzaria|japones|cafeteria|acai|noite",
  "mode": "light|dark",
  "brand": "#a63232",
  "background": "#fff8f2",
  "surface": "#ffffff",
  "text": "#251c1a",
  "heading_font": "padrao|moderna|elegante|forte|rustica|divertida",
  "body_font": "manrope|inter|nunito|lora",
  "radius": "reto|suave|redondo",
  "logo_url": "https://<supabase>/storage/v1/object/public/restaurant-media/<restaurant_id>/...",
  "cover_url": "https://… (mesma regra)"
}
```

- `save_menu_theme(p_restaurant uuid, p_theme jsonb)`: só o dono. Valida cada chave:
  - cores com o formato `^#[0-9a-f]{6}$`;
  - enums apenas da lista acima;
  - URLs apenas do bucket `restaurant-media` do próprio restaurante, que começam com o prefixo público do projeto e trazem `/<restaurant_id>/`;
  - nenhuma chave desconhecida.
  
  Qualquer violação gera `INVALID_INPUT`. `'{}'` volta tudo ao padrão.
- A validação de contraste também roda no servidor: texto × fundo ≥ 4.5 e texto × superfície ≥ 4.5, pela fórmula WCAG de luminância relativa, implementada em plpgsql. Abaixo disso gera `LOW_CONTRAST`.

## Temas prontos (valores iniciais, ajustáveis na implementação)
| Preset | mode | brand | background | surface | text | título | texto | cantos |
|---|---|---|---|---|---|---|---|---|
| brasa (atual) | light | #a63232 | #fff8f2 | #ffffff | #251c1a | padrao | manrope | suave |
| pizzaria | light | #c0392b | #fdf6e3 | #ffffff | #2b1d14 | rustica | nunito | suave |
| japones | dark | #d7263d | #111111 | #1c1c1c | #f5f5f5 | moderna | inter | reto |
| cafeteria | light | #6f4e37 | #f6efe6 | #fffaf3 | #2e221a | elegante | lora | suave |
| acai | light | #6a1b9a | #f7f0fb | #ffffff | #241430 | divertida | nunito | redondo |
| noite | dark | #e0a43a | #14110f | #201b18 | #f4ede4 | forte | inter | suave |

Escolher um tema copia todos os valores. O dono ajusta depois, e o `preset` fica como "personalizado" ao editar qualquer cor.

## Aplicação no cardápio
- `src/lib/menu-theme.ts` (puro, com testes):
  - `resolveTheme(theme)` mescla o tema com o padrão (brasa).
  - `themeVariables(theme)` devolve variáveis CSS:
    - `--brand`, `--brand-dark` (brand escurecida 15%), `--brand-contrast` (#fff ou #111 pelo melhor contraste);
    - `--background`, `--surface`, `--text`;
    - `--muted`, `--border` e `--soft` derivados por mistura de texto com fundo;
    - `--radius` (reto 4px, suave 14px, redondo 24px);
    - `--font-sans`, `--font-heading`.
  - `contrastRatio(a, b)` e `isReadable(theme)`.
- O wrapper `.customer-app` (lista e reels), a tela de acompanhamento e o PDF do relatório recebem `style={themeVariables(...)}`. O CSS existente já usa `--brand` e as demais variáveis. Onde houver cor fixa nas telas do cliente, troca por variável. Os botões primários passam a usar `--brand-contrast` no texto.
- Fontes: carregadas por `next/font/google` (self-hosted no build, sem domínio externo, compatível com a CSP) com `preload: false`, expostas como variáveis CSS:
  - títulos: Montserrat, Playfair Display, Bebas Neue, Alfa Slab One, Baloo 2;
  - texto: Inter, Nunito, Lora (a Manrope já existe).
  
  Os títulos (`h1`, `h2`, nomes de prato) usam `var(--font-heading)`.
- Logo: no topo da lista (no lugar do ícone da marca), no canto do reels, na tela de acompanhamento e no cabeçalho do PDF. Sem logo, mantém o visual atual.
- Capa: fundo do bloco de introdução da lista, com uma camada escura por cima para o texto ficar legível. Não aparece no reels.

## Gestão
- Bloco **"Aparência do cardápio"** em Configurações (`src/components/menu-theme-settings.tsx`):
  - cartões dos 6 temas;
  - envio de logo e de capa (reusa `optimizePhoto` e o upload no bucket `restaurant-media/<id>/`; logo com lado máximo de 512 px e capa com 1600 px);
  - claro/escuro;
  - 4 seletores de cor;
  - 2 seletores de fonte, com o nome mostrado na própria fonte;
  - cantos;
  - "Voltar ao padrão" por grupo.
- **Prévia ao vivo** ao lado (embaixo no celular): um card de prato, um botão e um título, já com as variáveis aplicadas.
- Aviso "O texto ficaria difícil de ler com essas cores" bloqueia o salvar quando `isReadable` é falso.
- Salva via rota de catálogo, ação `menu_theme`, que chama a RPC e invalida o cache do catálogo.

## Testes
- Unitário: `resolveTheme`, `themeVariables` (inclui `--brand-contrast` em cor clara e escura), `contrastRatio` (valores conhecidos: preto × branco = 21) e `isReadable`.
- Banco: só o dono salva; cor inválida, enum inválido, chave desconhecida, URL de outro restaurante e URL externa são recusados; baixo contraste gera `LOW_CONTRAST`; `'{}'` limpa; anon lê `menu_theme` (é público, faz parte do cardápio).
- Navegador: os 6 temas na lista e no reels, com print de cada um; cardápio sem tema igual ao atual.

## Publicação
Rodar a 018 antes do código. O catálogo lê `menu_theme` com `?? {}`, então o cardápio continua funcionando mesmo sem a migration, mas salvar a aparência dá erro.
