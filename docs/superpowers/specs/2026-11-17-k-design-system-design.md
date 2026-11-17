# K — Design system Fome Play (noturno e claro)

Data: 17/11/2026 · Aprovado pelo usuário no chat (referência: painel escuro com sidebar de item ativo vermelho, cartões cinza-chumbo arredondados, chips redondos, cards de prato, painel de carrinho) · Branch: `melhorias/piloto`

## Objetivo
Dar ao Fome Play uma identidade visual única, inspirada na referência, nos modos **noturno** e **claro**. A **gestão** é a que mais muda. O **cardápio do cliente só ganha acabamento**: o usuário pediu explicitamente para "não mexer muito no cardápio e fugir da ideia". O funcionamento continua idêntico.

Duas fases, cada uma publicada separadamente:
- **Fase 1:** base de tokens, modo noturno/claro, fonte e gestão inteira (incluindo a Visão geral em formato de painel).
- **Fase 2:** retoques do cardápio.

Esta spec cobre as duas fases. Cada fase terá um plano próprio.

## Tokens

Aplicados por `data-mode="dark" | "light"` no `<html>`. Os nomes reaproveitam as variáveis que o CSS já usa (`--background`, `--surface`, `--text`, `--muted`, `--border`, `--soft`, `--brand`, `--brand-dark`, `--brand-contrast`, `--radius`, `--font-sans`, `--font-heading`), para que as telas atuais herdem os valores sem reescrita. Variáveis novas: `--surface-2`, `--sidebar` e as cores de status.

| Token | Noturno | Claro |
|---|---|---|
| `--background` | `#161618` | `#f6f5f3` |
| `--sidebar` | `#1f1f22` | `#ffffff` |
| `--surface` | `#242427` | `#ffffff` |
| `--surface-2` | `#2e2e32` | `#efece8` |
| `--soft` | `#2a2a2e` | `#f1efec` |
| `--border` | `#38383d` | `#e7e3de` |
| `--text` | `#f4f4f5` | `#1d1d1f` |
| `--muted` | `#a1a1aa` | `#6b6b70` |
| `--brand` | `#d32f2f` | `#d32f2f` |
| `--brand-dark` | `#b3261e` | `#b3261e` |
| `--brand-contrast` | `#ffffff` | `#ffffff` |
| `--success-bg` / `--success-text` | `#14532d` / `#bbf7d0` | `#dcfce7` / `#166534` |
| `--warning-bg` / `--warning-text` | `#78350f` / `#fde68a` | `#fef3c7` / `#92400e` |
| `--danger-bg` / `--danger-text` | `#7f1d1d` / `#fecaca` | `#fee2e2` / `#991b1b` |

- O vermelho da marca é `#d32f2f` e não o `#e23d32` da prévia. O branco sobre `#e23d32` dá cerca de 4,1:1, abaixo do mínimo de 4,5:1. Sobre `#d32f2f`, passa de 4,5:1. Visualmente fica praticamente igual.
- **Raio:** cartões `20px` (`--radius-card`), controles `14px` (`--radius`), chips e busca `999px`.
- **Fonte:** **Poppins**, self-hosted via `@fontsource/poppins` nos pesos 400, 500, 600 e 700, como `--font-sans` e `--font-heading` padrão. Ela substitui a Manrope.
- **Sombras:** nenhuma no noturno. No claro, apenas `0 1px 2px rgba(0,0,0,.06)` nos cartões.

## Modo noturno e claro
- **Valor inicial:** se `localStorage["fp:mode"]` for `"dark"` ou `"light"`, usa esse valor. Senão, segue `prefers-color-scheme`.
- **Sem flash:** um script inline mínimo no `<head>` do layout raiz define `data-mode` antes da primeira pintura. A CSP atual já permite `'unsafe-inline'` em `script-src`. O script é estático e não usa dados do usuário.
- **Botão lua/sol** (`ModeToggle`):
  - alterna o modo, grava no `localStorage` (com `try/catch`) e atualiza `data-mode` e `color-scheme`;
  - aparece no rodapé da sidebar da gestão, no topo do cardápio (Fase 2) e no login.
- **Restaurante com tema próprio** (`menu_theme` com chaves de estilo, projeto C): o `useMenuTheme` continua escrevendo as variáveis inline no `<html>`, e estilo inline vence o `[data-mode]`. Nesse caso o botão lua/sol **não aparece** no cardápio, porque quem decide é o restaurante. Sem tema próprio, o cardápio usa os tokens do design system e o botão aparece.
- Lógica pura em `src/lib/color-mode.ts`: `resolveMode(stored: string | null, prefersDark: boolean): "dark" | "light"`. O script inline repete a mesma regra em poucas linhas, e um teste garante que os dois concordam.

## Fase 1 — Gestão

**Shell** (`connected-admin.tsx` e CSS `.connected-*`):
- **Sidebar** com fundo `--sidebar`, logo "fome play" no topo e itens com ícone + nome. O item ativo vira uma pílula vermelha (`--brand`, texto `--brand-contrast`). No rodapé ficam o botão lua/sol e "Ver cardápio".
- **Área principal** com fundo `--background`.
- **Cartões** (`.admin-panel`, `.connected-panel`, `.order-card` etc.): `--surface`, `--radius-card`, sem borda no noturno, borda `--border` no claro.
- **Botões:**
  - primário vermelho, um por bloco;
  - secundário com fundo `--surface-2`;
  - ghost transparente.
- **Inputs, selects e busca:** fundo `--surface-2`, raio `--radius`. A busca usa raio de pílula.
- **Tabelas:** cabeçalho `--muted` com 12 px, linhas separadas por `--border` e sem zebra.
- **Etiquetas de status de pedido**, usadas no quadro de pedidos, nas tabelas e nos cards:
  - entregue → success;
  - em preparo / recebido / pronto / saiu para entrega → warning;
  - aguardando pagamento / aceite → warning;
  - cancelado / recusado → danger.
- **Mapeamento:** função pura `statusTone(status): "success" | "warning" | "danger" | "neutral"` em `src/lib/order-flow.ts`.

**Visão geral** (página `resumo`), no formato de painel da referência:
- **Busca no topo:** filtra no navegador a tabela de últimos pedidos (por número, cliente ou prato) e os cards de pratos.
- **"Pratos mais pedidos":** até 6 cards com foto (`photo_url`), nome, preço e unidades vendidas no mês. Os dados vêm de `results_report` (top_quantity do mês atual, via rota `/results` que já existe). Sem dados, mostra o estado vazio "Ainda sem pedidos entregues neste mês".
- **"Últimos pedidos":** tabela com número, cliente, tipo (mesa/retirada/entrega), valor e etiqueta de status, usando os 8 pedidos mais recentes de `data.orders` (já carregados).
- **Painel à direita, "Pedido mais recente":**
  - tipo, endereço (se entrega) ou mesa;
  - itens com quantidade;
  - total;
  - botão "Ver pedidos", que leva à aba Pedidos.
  
  No celular, o painel desce para baixo dos cards.
- **Os números que já existem na Visão geral** (pedidos do dia etc.) continuam, agora como cartões de métrica no topo.

**Login** (`/login`): cartão central no novo estilo, com botão lua/sol.

## Fase 2 — Cardápio (só acabamento)
- **Lista:**
  - **categorias** viram chips redondos de 56 px, com a foto do primeiro prato com foto da categoria (fallback: o ícone atual) e o nome embaixo;
  - **cards de prato** com raio `--radius-card`, foto com cantos arredondados, preço em destaque e botão "Adicionar" vermelho;
  - **layout, ordem e textos não mudam.**
- **Sacola:**
  - estilo do painel "Cart" da referência: título com contagem e linhas de item com foto pequena e controle de quantidade;
  - totais (Subtotal, Taxa, **Total**) e botão "Revisar pedido" vermelho de largura total;
  - as ofertas de upsell mantêm a posição atual.
- **Finalização:** a escolha entre Entrega / Retirada (e Mesa, quando existir) vira um seletor segmentado de três botões lado a lado, com o ativo em vermelho. Os campos e as regras não mudam.
- **Reels:** não muda, exceto o botão lua/sol no topo quando não há tema próprio.
- **Acompanhamento do pedido:** cartões e etiquetas de status no novo estilo.
- **Restaurantes com tema próprio** continuam com as cores, fontes e cantos do tema.

## Fora de escopo
- Mudar fluxos, textos ou regras.
- Novos gráficos.
- Telas novas além do conteúdo da Visão geral descrito acima.
- Redesenhar o reels.

## Performance
- Nenhuma tela pode ficar mais lenta. Medir o cardápio com o script de toques (celular simulado, CPU 4x) antes e depois de cada fase.
- A sessão de performance mostrou que a lentidão atual não vem do CSS, mas o design system não deve introduzir:
  - `backdrop-filter`;
  - sombras em listas grandes;
  - `:has()` novos em seletores amplos.

## Testes
- **Unitário:**
  - `resolveMode`, incluindo a concordância com o script inline (o teste lê o arquivo do script e o executa com entradas conhecidas);
  - `statusTone`.
- **Visual (Playwright, local):** capturas da gestão (Visão geral, Pedidos, Configurações) e do login, nos dois modos. Na Fase 2, capturas do cardápio (lista, sacola, finalização) nos dois modos e com um tema próprio aplicado.
- **Regressão:** `npm run test:online`, `test:database`, `tsc`, `lint` e `build`.

## Publicação
Nenhuma migration é necessária. Cada fase vai para o `main` depois da revisão final e do OK do usuário.
