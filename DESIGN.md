---
name: Brasa
description: Cardápio com comida em destaque e gestão do atendimento — demonstração local e extensão conectada ao Supabase.
colors:
  brand: "#a63232"
  brand-dark: "#852626"
  background: "#fff8f2"
  surface: "#fff"
  text: "#251c1a"
  muted: "#6f605b"
  border: "#e9ded6"
  soft: "#f5eee7"
  green: "#33704d"
  danger: "#a32929"
  admin-background: "#fcfaf7"
  sidebar-background: "#fffaf5"
typography:
  display:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "37px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "14px"
    fontWeight: 450
  label:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "12px"
    fontWeight: 750
rounded:
  control: "9px"
  panel: "12px"
  food-card: "14px"
  dialog: "18px"
  mobile-sheet: "20px"
spacing:
  compact: "8px"
  control: "12px"
  regular: "16px"
  panel: "20px"
  roomy: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  button-primary-hover:
    backgroundColor: "{colors.brand-dark}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  button-secondary:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.brand}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 19px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
  category-active:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "13px 14px"
  food-tag:
    backgroundColor: "{colors.background}"
    textColor: "{colors.brand}"
    rounded: "7px"
    padding: "8px 11px"
  bag-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.food-card}"
---

# Design System: Brasa

## Overview

**Creative North Star: "Comida no centro, pedido à mão"**

O Brasa combina fundo creme, vinho fechado, Manrope local e fotografia de comida em escala generosa. A identidade é acolhedora e direta: hierarquia de preço, controles sólidos, ícones lineares e separações discretas deixam a escolha e o pedido visíveis.

A gestão compartilha essa linguagem, com maior densidade de dados, superfícies claras e estados escritos por extenso. O nome Brasa identifica o projeto e o demonstrativo; na gestão conectada, a marca textual exibe o nome cadastrado pelo restaurante. Nome comercial definitivo continua aberto em PRODUCT.md.

**Key Characteristics:**
- Fotografia e vídeo como conteúdo principal do cardápio.
- Vinho nas ações e seleções; creme no ambiente e branco nas superfícies.
- Tipografia única com contraste de tamanho e peso.
- Movimento curto, ligado à ação, com alternativa de movimento reduzido.

Este documento registra o sistema inicial de 11/10/2026 e sua extensão conectada de 12/10/2026, preservando a identidade e os tokens existentes. Autoridade visual: PRODUCT.md, TELAS-E-DESIGN.md e .impeccable/surface-brief.md. Fonte dos valores: src/app/globals.css; fonte local carregada em src/app/layout.tsx. A extensão usa src/components/connected-admin.tsx, src/components/connected-tracking.tsx e os estilos .connected-* como verdade de implementação. Demonstração local e fluxo conectado ao Supabase coexistem; os comportamentos próprios de cada um estão identificados abaixo.

Evidência histórica do demonstrativo local (11/10/2026): existem capturas em .impeccable/review/desktop.png, mobile.png, admin-desktop.png, admin-mobile.png, admin-drawer-mobile.png e bag-mobile.png. A revisão final resultou em SHIP no escopo das três correções solicitadas: foco/inert do menu móvel, alvos de toque identificados e contraste dos textos de apoio. O revisor inspecionou as seis capturas atualizadas. Treze cenários Playwright distintos passaram em lotes; cinco verificações afetadas foram repetidas com sucesso, incluindo quinze ciclos de Tab, fechamento inerte, Escape e retorno de foco, mudança para desktop, controles medidos de 44px, detalhe móvel e ausência de sobreposição na compra. Build passou; lint terminou sem erros ou avisos. Esse parecer é limitado à lista de correções revisada: não certifica acessibilidade de todo o produto nem funcionamento conectado em produção. O launcher/detector retornou cache_directory_failed; a extração foi feita diretamente do código.

Evidência da extensão conectada (12/10/2026), informada pelo agente responsável pela implementação: migrations 001–004 aplicadas no projeto Supabase; 14 tabelas públicas com RLS; 24 testes locais de banco aprovados; teste Playwright real de login, onboarding, foto, pedido, atualização de status e isolamento aprovado. Os dados temporários desse teste foram removidos. Capturas disponíveis em .impeccable/review/connected-admin-desktop.png, connected-admin-mobile.png e connected-order-mobile.png. Esta atualização documental inspecionou o código e registrou os resultados recebidos, sem acessar credenciais ou executar testes. A revisão independente da extensão conectada resultou em SHIP no escopo visual das três capturas: gestão desktop/mobile e acompanhamento mobile. Esse parecer não certifica produção ou acessibilidade completa.

Limitações atuais: Cloudflare Stream retorna HTTP 403; a associação observacional vídeo/sacola/pedido está implementada; o percurso completo com upload real ainda depende do Stream; não há aprovação geral de produção. Controles de vídeo, upload ou métricas visíveis na interface não demonstram, por si, que esse percurso foi validado de ponta a ponta.

## Colors

A paleta usa vinho fechado sobre creme quente e superfícies brancas, com texto marrom escuro e separações suaves. Os valores normativos estão no frontmatter; a correspondência com CSS é direta para os nove primeiros tokens.

### Primary

- **Vinho da casa — brand:** ações principais, categoria selecionada, ícones de destaque e links de ação.
- **Vinho escuro — brand-dark:** fundo de hover do botão principal.

### Neutral

- **Creme — background:** ambiente do cliente e fundo dos diálogos.
- **Branco — surface:** sacola, formulários e painéis de gestão.
- **Marrom escuro — text:** leitura principal e toast.
- **Marrom de apoio — muted:** descrições, legendas e placeholders; já incorpora a correção recente.
- **Areia — border:** contorno fino e divisórias.
- **Creme de apoio — soft:** ações secundárias e agrupamentos discretos.
- **admin-background / sidebar-background:** pequenas diferenças tonais entre área de trabalho e navegação da gestão.

Verde (green) informa abertura e andamento; vermelho de exclusão (danger) identifica a ação destrutiva. Etiquetas de pedido têm cores próprias definidas no CSS e sempre mostram o nome do estado; não constituem uma segunda identidade de marca.

**The Legibilidade da Comida Rule.** O gradiente escuro fica restrito à fotografia para sustentar o texto; preço e adicionar permanecem em superfície clara externa à imagem.

## Typography

**Display Font / Body Font:** Manrope Variable, fallback sans-serif, empacotada por @fontsource-variable/manrope. Não há segunda família ou fonte de ícones. Lucide fornece os ícones lineares.

A hierarquia é feita com tamanho, peso e espaçamento entre letras. Os tokens display, headline e title representam respectivamente o nome do produto na fotografia, a introdução do cardápio e o título do diálogo em desktop; não são uma escala universal aplicada a todos os títulos.

O corpo base usa peso (450), e os parágrafos têm entrelinha (1.65). A aplicação usa muitos apoios compactos entre (8–12px), especialmente na gestão; isso descreve a implementação e não é recomendação para reduzir textos novos. Ações usam peso (750); títulos de destaque, (800). Preços e métricas usam números tabulares.

O produto varia para (42px) em telas amplas, (31px) no móvel e (28px) no móvel baixo. O título da gestão usa (25px) no padrão. Inputs de formulários passam para (16px) no móvel. Não há razão modular única na escala implementada.

Na extensão conectada, o título principal da gestão usa (32px), com espaçamento entre letras de (-1px), e passa a (28px) no móvel. Títulos de seção usam (20px), com (-0.5px). A navegação usa (13px / 650); indicadores usam (32px), reduzidos para (26px) até (1100px). São ajustes locais observados, sem substituir os tokens tipográficos do cardápio.

## Layout

Cliente: contêiner de até (1480px), com preenchimento lateral padrão de (5%). O desktop distribui categorias, produto e sacola em (190px / minmax(340px, 1fr) / 292px), com intervalo (30px). A composição específica do primeiro viewport continua descrita no surface-brief; essas medidas são observações dessa superfície.

Gestão do demonstrativo local: navegação fixa de (232px), conteúdo até (1550px), preenchimento padrão (35px 36px 30px). Estatísticas usam quatro colunas; painéis usam (1.3fr / 1fr). Tabelas e o quadro de pedidos preservam rolagem horizontal quando necessário.

| Condição implementada | Resposta |
| --- | --- |
| min-width: 1500px | Colunas do cliente (205px / flexível / 310px), intervalo (36px) e mídia maior. |
| max-width: 1200px | Cliente mais compacto; navegação da gestão com (207px). |
| max-width: 980px | Sacola lateral oculta e acesso flutuante; estatísticas em duas colunas; painéis da gestão em uma coluna. |
| max-width: 700px | Cliente em uma coluna, categorias inferiores fixas e roláveis; gestão do demonstrativo com gaveta de (252px); diálogo vira painel inferior. |
| max-width: 370px | Ajustes de margens, marca, categorias e estatísticas. |
| max-width: 700px + max-height: 740px | Introdução e legenda reduzidas para acomodar o produto e a compra. |

A revisão solicitada pelo usuário em 12/10/2026 substitui o cardápio com barras pelo modo imersivo. A mídia ocupa 100dvh; no celular vai de borda a borda, e no desktop fica centralizada sobre fundo #111, com controles externos de avançar/voltar. Cabeçalho compacto, nome, descrição, preço e ícones são sobrepostos à mídia. Não existem faixas claras de preço, ação Adicionar, campo de busca ou sacola permanentemente aberta nesse modo: detalhes/compra, busca, informações e sacola usam painéis. Categorias ficam sobre a mídia na base e respeitam env(safe-area-inset-bottom). Gesto vertical troca o prato; gesto horizontal troca a categoria. A lista tradicional preserva sua estrutura. Esta direção substitui o layout anterior, rejeitado pelo usuário, sem alterar as cores da gestão.

Gestão conectada: grade com navegação de (236px) e conteúdo flexível. A lateral é sticky, ocupa (100dvh) e usa preenchimento (28px 20px); o conteúdo tem largura máxima (1500px) e preenchimento (32px 36px 64px). A faixa superior parte de (84px). Estatísticas usam três colunas com intervalo (18px); produtos usam duas. Até (1100px), a lateral passa a (200px), produtos ficam em uma coluna e conteúdo usa (25px 22px).

Até (700px), a gestão conectada passa a um fluxo vertical: lateral estática no topo, navegação horizontal rolável e ações de conta visíveis abaixo. Ela não usa a gaveta do demonstrativo. Estatísticas ficam em uma coluna, com rótulo e valor lado a lado; conteúdo usa (22px 16px 40px) e faixa superior parte de (70px). O quadro conectado tem três colunas de no mínimo (240px) no desktop e (minmax(270px, 85vw)) no móvel, com rolagem horizontal. Tabelas preservam largura mínima (600px) dentro de área rolável. O acompanhamento conectado tem largura máxima (800px), e suas etapas quebram em múltiplas linhas.

## Elevation & Depth

A base é plana: contornos finos e diferenças tonais separam os painéis. A gestão conectada mantém os painéis existentes e usa superfície quase branca (#fffdfb) na lateral e no topo; não acrescenta um novo vocabulário de sombras. Sombras têm função localizada de sobreposição ou estado, sem transformar toda área em cartão elevado.

- Diálogo: (0 25px 80px #251c1a30), com overlay (rgba(28, 20, 16, 0.42)).
- Toast: (0 9px 28px #251c1a25).
- Sacola flutuante: (0 5px 22px #54191923).
- Categorias móveis: (0 -6px 18px #251c1a04).
- Seleção segmentada: (0 2px 4px #251c1a08).
- Campo em foco: (0 0 0 3px #a6323212), junto à borda da marca.

Os valores completos, movimento e breakpoints estão também nas extensões do sidecar.

## Shapes

Controles têm cantos suaves, painéis um pouco mais amplos e diálogos o maior raio. O painel móvel arredonda apenas os cantos superiores. Avatares, controles de mídia e marcadores de status são circulares. Fotografias usam object-fit: cover; o bloco de preço fecha o cartão com cantos inferiores, sem arredondamento intermediário duplicado.

## Components

### Buttons

Ação sólida e compacta. Button, em src/components/ui/button.tsx, aceita variant: default, secondary, ghost, outline, destructive; size: default, sm, icon; e asChild para compor links. Props nativas do botão e className são repassados. Os nomes da API não são tokens extras.

Default tem altura mínima (44px); icon ocupa (44 × 44px). sm permanece com altura mínima (38px) no estilo base: não pressupor que todo botão já satisfaz o requisito de toque do produto. Hover escurece levemente botões; primary troca para brand-dark, outline e ghost usam soft. Pressionar aplica scale(0.98); desabilitado tem opacidade (0.45), exceto o botão vazio da sacola, que usa tratamento próprio.

Transições de botão duram (150ms), com ease para cor e cubic-bezier(0.23, 1, 0.32, 1) para transformação. O foco geral tem contorno de (3px solid #a6323280) e afastamento (3px).

### Inputs / Fields

Superfície branca, borda de um pixel e preenchimento definido nos tokens. Altura mínima (44px); textarea parte de (84px) e redimensiona verticalmente. O foco muda borda e acrescenta anel; a busca trata foco no contêiner. Checkboxes são nativos com accent-color da marca; a caixa visual usa (17px), dentro do rótulo. Alguns selects compactos ainda têm sobrescritas menores: medir a área interativa antes de afirmar conformidade.

### Navigation

Categoria desktop usa ícone, texto e seleção vinho sólida, com altura mínima (51px). No celular, a barra é horizontal, fixa e rolável; cada categoria tem altura mínima (56px). A navegação da gestão usa fundo vinho pálido na seleção e links de altura mínima (45px).

O menu móvel da gestão do demonstrativo usa inert quando fechado, move e contém foco quando aberto, fecha com Escape e devolve foco ao disparador. O conteúdo de fundo fica inert durante abertura. Esses comportamentos pertencem ao escopo histórico de verificação, não constituem relatório de teste completo da extensão conectada.

A gestão conectada usa botões de seção com aria-current=page na seleção, altura mínima (46px), preenchimento (13px 14px), raio (10px), fundo selecionado (#f5e5df) e hover (#f9eeea). Donos veem todas as seções; operação vê Visão geral e Pedidos. No móvel, essa mesma navegação permanece exposta e rola horizontalmente; não herda o tratamento de foco de uma gaveta.

### Cards / Containers

Sacola e painéis usam branco com contorno; fotografia ocupa a maior superfície do produto e o preço permanece abaixo. Não há API genérica de Card: são composições próprias das telas. Os chips de produto usam creme, texto vinho, raio (7px), peso (750) e tamanho (9px); são etiquetas informativas, não filtros.

### Modal

Modal, em src/components/ui/dialog.tsx, recebe open, onOpenChange, title, description opcional, children e wide. É composto com Radix Dialog. Em desktop limita largura a (510px), ou (780px) com wide, e altura a (90dvh); no celular ocupa a base da tela e até (92dvh). Entrada do overlay (180ms); entrada do conteúdo e da gaveta (220ms). O movimento do painel móvel parte de translateY(25px); o diálogo desktop faz pequeno deslocamento vertical e fade.

### Produto, mídia e feedback

O feed usa scroll-snap nativo no eixo vertical. ProductMedia recebe product e preview opcional. No modo imersivo, o vídeo ativo inicia automaticamente sem som, salvo preferência de movimento reduzido ou bloqueio do navegador. Pausa fora da tela, ao ocultar a página, ao abrir painéis e quando outro vídeo toca. A ação manual de pausa é respeitada. Lista e prévias continuam com reprodução manual e preload=none. Falha de vídeo mantém foto substituta e mensagem. A indicação de fotografia evita simular um vídeo inexistente.

Prefers-reduced-motion reduz animações e transições a (0.01ms) e remove rolagem suave. O viewport de Reels mantém snap obrigatório por ser parte da navegação, sem animação programática nesse modo. O toast do feed fica no alto e não recebe eventos de ponteiro, preservando acesso ao preço e ao botão de adicionar.

### Gestão e acompanhamento conectados

ConnectedAdmin recebe id do restaurante. A interface apresenta Visão geral, Pedidos, Produtos, Categorias, Métricas, Contatos, Configurações e QR das mesas conforme o papel retornado. Carregamento usa role=status; falhas usam role=alert, avisam que os dados podem estar desatualizados e oferecem Tentar novamente. Há atualização manual, assinatura Supabase de alterações em pedidos e reconciliação a cada (15 segundos) enquanto a página está visível. Ao voltar à página, os dados são consultados novamente. O toast de sucesso dura (3500ms). Esses intervalos são comportamento de dados e feedback, não novos tokens de movimento.

O quadro separa Recebidos, Em preparo e Prontos; um botão alterna para Entregues e Cancelados. Ações por pedido são escritas por extenso, têm altura mínima (44px), permitem quebra de linha e ficam desabilitadas enquanto uma atualização está em andamento. A mudança abre o Modal existente: preparo aceita estimativa opcional e cancelamento exige motivo. O resumo informa o tamanho da amostra de pedidos e o limite de (200), sem apresentar total de pedidos como pagamento confirmado.

Produtos aparecem em painéis com fotografia ocupando (36%) da largura, nome, preço e estados de publicação/disponibilidade. A busca tem altura mínima (46px); configurações usam formulário de até (760px). O QR mostra a mesa escolhida, o endereço correspondente e ação de download; a visualização parte de um QR gerado com margem e cores de alto contraste do sistema. Os componentes de upload e métricas de vídeo são pontos de integração visíveis; a associação observacional de vídeo, sacola e pedido está implementada, mas a limitação do Stream permanece explícita no escopo da evidência.

ConnectedTracking recebe restaurantId, slug e id opcional. Mostra um pedido ou os pedidos conhecidos pela sessão, consultando o backend a cada (5 segundos) enquanto a página está visível e ao retornar a ela. Tem estados de carregamento, erro com repetição e lista vazia. Cada pedido usa painel branco com borda, raio (18px), preenchimento (26px) — (18px) no móvel —, número, mesa, horário, itens e total. Etapas concluídas combinam texto, ícone e tonalidade verde; cancelamento mostra o motivo em vez das etapas. A estimativa é identificada como informação da equipe, e o pagamento continua no local.

## Do's and Don'ts

### Do:
- **Do** preservar a paleta e a Manrope local descritas nos tokens.
- **Do** manter preço e ação de adicionar fora da fotografia.
- **Do** usar estados textuais junto às cores e foco visível nos controles.
- **Do** respeitar a área segura e o espaço ocupado pela navegação inferior.
- **Do** distinguir demonstração local de dados conectados; manter a indicação de demonstração nas superfícies que ainda usam dados locais.

### Don't:
- **Don’t** apresentar dados locais como conectados ou a integração testada como aprovação geral de produção.
- **Don’t** usar o gradiente de legibilidade da fotografia como decoração geral.
- **Don’t** reproduzir marcas ou logotipos das referências fornecidas.
- **Don’t** inferir aprovação de acessibilidade completa a partir das capturas ou dos ajustes de CSS.
