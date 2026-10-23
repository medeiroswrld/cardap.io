# Subprojeto A — Fundação

Data: 23/10/2026. Branch: `melhorias/a-fundacao` (worktree separada; o `main` segue com o Codex).

Primeiro de seis subprojetos de melhoria, na ordem aprovada: A (fundação) → B (operação da cozinha) → C (identidade por restaurante) → F (escala) → E (agência) → D (vendas). Cada um tem spec, plano e implementação próprios.

## Objetivo

Deixar a base segura, rápida e pronta para domínio próprio, sem mudar a experiência Reels nem os contratos de pedido.

Critérios de sucesso:

- Compartilhar `/r/<slug>` mostra nome do restaurante e foto de prato na prévia (WhatsApp/Instagram/Google).
- Respostas HTML e de API carregam cabeçalhos de segurança; cardápio, gestão, upload, vídeo HLS legado e Realtime continuam funcionando com a CSP ativa.
- Fotos novas chegam ao Storage em WebP de no máximo 1080 px no maior lado.
- O catálogo público não consulta o banco a cada visita; alterações salvas na gestão aparecem no cardápio na próxima atualização do cliente.
- Nenhuma alteração em migrations, schema ou regras de pedido.

## 1. Demo isolada e metadados por restaurante

- `DemoProvider` sai de `src/app/layout.tsx` e passa a envolver apenas as rotas de demonstração (`/r/demo`, `/r/demo/pedidos`, `/demo/gestao`). As rotas conectadas já fornecem `DemoContext` pelo `ConnectedMenuProvider`; páginas que hoje dependem do provider global sem fornecer outro (login, gestão conectada, privacidade, erro, 404) devem ser verificadas e, se consumirem `useDemo`, receber o provider adequado ou deixar de consumi-lo.
- Layout raiz: metadados neutros da marca de plataforma (Cardap.io), `metadataBase` a partir de `NEXT_PUBLIC_APP_URL`, `robots` padrão `noindex`.
- `/r/[slug]` ganha `generateMetadata`: título `"<Restaurante> · Cardápio"`, descrição padrão `"Veja o cardápio de <Restaurante>, escolha e peça direto da mesa."` (a tabela `restaurants` não tem campo de descrição; um campo próprio pode entrar no subprojeto C), Open Graph e Twitter card com a foto do primeiro produto publicado que tenha foto (ou capa de vídeo). Sem foto: sem imagem OG. Cardápios reais com `robots: index, follow`. `/r/demo` continua `noindex`.
- A leitura para metadados reutiliza a mesma função de catálogo (com cache, seção 4), para não duplicar consultas.
- Domínio: nenhum endereço fixo no código. Trocar `NEXT_PUBLIC_APP_URL` (e refazer o build) muda metadados, QR e validação de origem.

## 2. Cabeçalhos de segurança

Aplicados em `next.config.ts` (`headers()`) para todas as rotas:

- `Content-Security-Policy`: `default-src 'self'`; `connect-src` com o próprio site, origem do Supabase (`https://<projeto>.supabase.co` e `wss://<projeto>.supabase.co`) e Cloudflare Stream apenas se as variáveis legadas existirem; `img-src 'self' data: blob:` + Supabase (+ Cloudflare legado); `media-src 'self' blob:` + Supabase (+ Cloudflare legado); `font-src 'self'`; `style-src 'self' 'unsafe-inline'`; `script-src 'self' 'unsafe-inline'` (necessário para scripts inline do App Router sem nonce; nonce fica como evolução possível, porque obrigaria renderização dinâmica em todas as páginas); `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`. Em desenvolvimento, adicionar `'unsafe-eval'` em `script-src` somente se o Next exigir.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (apenas produção).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
- A origem do Supabase é derivada de `NEXT_PUBLIC_SUPABASE_URL` no build. A montagem da política fica numa função pura testável (`src/lib/security-headers.ts`).
- O subprojeto E (Pixel/GA4) precisará incluir domínios de terceiros nessa função; documentar no próprio arquivo.

## 3. Fotos otimizadas

- Nova função de navegador `optimizePhoto(file)` (ao lado de `video-cover.ts`): decodifica a imagem, reduz para no máximo 1080 px no maior lado (sem ampliar), exporta WebP qualidade 0,82; se o navegador não exportar WebP, usa JPEG 0,82. Se o resultado ficar maior que o original e o original já estiver dentro do limite de dimensão e do tipo permitido, mantém o original.
- Aplicada no fluxo de cadastro de produto da gestão conectada antes do upload ao bucket `restaurant-media`. Capa gerada de vídeo passa pela mesma regra de dimensão (já é 720×1280, portanto não muda).
- Falha de decodificação mostra a mensagem existente de envio de foto, sem enviar arquivo corrompido.
- O limite do bucket (5 MB, JPEG/PNG/WebP) permanece; a compressão reduz o risco de recusa.
- Script `scripts/optimize-existing-photos.mjs` para fotos já publicadas: por padrão só lista o que faria (tamanho atual, estimativa). Com `--apply` e confirmação explícita do usuário no momento da execução, baixa cada `photo_url` do bucket, converte com o FFmpeg local (`.tools/ffmpeg`, já usado por `prepare:media`), envia para um novo caminho sem sobrescrever e atualiza `products.photo_url`. Não apaga o arquivo antigo. Efeito documentado: métricas de foto agrupadas por endereço passam a contar como nova versão a partir da troca.

## 4. Cache do catálogo público

- `readCatalog(slug)` passa a ser cacheado no servidor por até 60 segundos, com tag por restaurante (`catalog:<restaurantId>`) e por slug.
- Invalidam a tag do restaurante após sucesso: `POST /api/restaurants/[id]/catalog` em todas as ações exceto `revoke_marketing` e `moderate_feedback` (que não alteram o catálogo público), e `PATCH /api/restaurants/[id]/media` (publicação de vídeo). `workspace` é somente leitura; `subscribe`, pedidos, sessões e métricas não invalidam.
- Dados que mudam por pedido ou sessão (status do pedido, sessão de visitante, interações sociais) não entram no cache.
- O mecanismo exato (API de cache do Next 16 instalado) é escolhido no plano após leitura de `node_modules/next/dist/docs/`, conforme `AGENTS.md`.
- A rota `/api/catalog/[slug]` (polling do cliente a cada 15 s) usa a mesma leitura cacheada.

## 5. Checklist manual (executado pelo usuário)

Documento `docs/checklist-fundacao.md` com passo a passo:

1. Rotacionar as credenciais expostas (Supabase service role, anon se necessário, Cloudflare), atualizando Vercel e `.env.local` antes de revogar as antigas.
2. Comprar domínio, apontar na Vercel, atualizar `NEXT_PUBLIC_APP_URL`, URL do site e redirects no Supabase Auth, redeploy.
3. Configurar SMTP (Resend) no Supabase Auth com o domínio novo; testar cadastro e recuperação de senha.
4. Conferir o plano da Vercel: Hobby é restrito a uso não comercial; com clientes pagantes, migrar para Pro.
5. Reimprimir QR somente depois do domínio definitivo.

## Testes

- Unitário (node:test, padrão de `scripts/test-*.mjs`): montagem da CSP com e sem Cloudflare; ausência de `'unsafe-eval'` em produção.
- Playwright: cabeçalhos presentes na resposta de `/r/demo` e de uma API; `/r/demo` sem erros de CSP no console com vídeo e foto; metadados de `/r/demo` com `noindex`.
- Playwright conectado (opt-in `RUN_CONNECTED_LIVE=1`): título e `og:image` de um restaurante temporário; edição de preço na gestão refletida no cardápio após invalidação.
- Teste de navegador para `optimizePhoto`: imagem 3000×2000 resulta em ≤1080 px, tipo WebP ou JPEG.
- Regressão: `npm run lint`, `npm run typecheck`, `npm run build -- --webpack`, `npm test`, `npm run test:database`, `npm run test:observability`.

## Fora do escopo

Logo/cores por restaurante (C), Pixel/GA4 (E), agregação de métricas (F), mudanças de schema, publicação/deploy e execução do script de fotos em produção sem autorização explícita.
