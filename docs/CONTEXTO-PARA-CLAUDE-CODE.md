# Cardap.io — contexto completo para continuidade no Claude Code

Atualizado em 21/10/2026. Documento de transferência de contexto: ideia, produto, decisões do fundador, implementação e pendências. Não contém credenciais. Leia o código e o estado do Git antes de modificar qualquer coisa; o projeto já existe e tem usuários/dados de teste em serviços reais.

Complemento de 22/10/2026: veja `docs/piloto.md` para limites compartilhados no Postgres (migration 010), configuração de segredos na Vercel e preparação de vídeos; veja `docs/observability.md` para o logger Pino com campos restritos. Novos uploads na gestão geram capa JPEG no navegador. A rotação das credenciais expostas continua pendente. As descrições abaixo refletem o levantamento original; confirme o deployment ativo antes de assumir que um ajuste local já está publicado.

Complemento de 23/10/2026 (branch `melhorias/a-fundacao`): cabeçalhos de segurança/CSP em `src/lib/security-headers.ts` (terceiros como Pixel/GA4 precisam ser liberados ali); `DemoProvider` restrito às rotas de demonstração; metadados e prévia de link por restaurante; catálogo público cacheado por 60 s com invalidação nas mutações do dono (`src/lib/catalog-cache.ts`); fotos novas convertidas para WebP ≤1080 px no navegador; script `npm run optimize:photos` para as antigas. Passos manuais em `docs/checklist-fundacao.md`.

## 1. O que estamos construindo

Cardap.io é uma aplicação web para restaurantes, hamburguerias e estabelecimentos semelhantes. Une um cardápio visual com experiência de Reels, pedidos feitos pelo cliente na mesa, gestão operacional, métricas de interesse nos pratos e interações sociais.

A proposta é permitir que o cliente descubra o que quer comer vendo fotos e vídeos curtos, personalize o prato e envie o pedido pelo próprio celular. O restaurante mantém catálogo, preços e disponibilidade, recebe os pedidos e acompanha como as pessoas interagem com os produtos.

Uma frase que resume a intenção do produto:

> Um cardápio que se navega como Reels, conectado à operação do restaurante.

O nome usado no repositório é `cardap.io`. Existem referências antigas a “Brasa”, “Cardápio Reels” e o pacote `brasa-cardapio`: são nomes históricos de desenvolvimento/demonstração, não aplicações diferentes. A marca comercial definitiva ainda pode ser refinada.

Não é apenas uma página com vídeos, nem um clone completo de rede social. A descoberta visual precisa terminar em uma escolha clara e em um pedido correto, recebido pela equipe do estabelecimento.

## 2. Público e modelo de negócio

- **Cliente do restaurante:** acessa pelo QR/NFC/link, navega sem cadastro, escolhe e pede.
- **Dono:** cadastra produtos, publica mídias, configura o restaurante, consulta métricas/contatos e modera comentários.
- **Operação/cozinha/atendimento:** acompanha pedidos e atualiza o andamento, com permissões menores que as do dono.
- **Agência/implantador:** possível canal futuro para cadastrar restaurantes e produzir materiais; não existe painel de agência implementado.

A intenção comercial é um SaaS cobrado por restaurante, possivelmente com três planos de assinatura e um serviço opcional de implantação/conteúdo. **Não há preços de mensalidade validados, planos ativos ou cobrança automática implementada.** O pacote de implantação de R$ 400 citado nos documentos iniciais é uma hipótese, não uma oferta consolidada.

Primeiro validar em poucos restaurantes: facilidade de cadastrar produtos, clareza dos pedidos, adoção pela equipe, custo de mídia e disposição real de pagar. Não presumir que tempo assistido significa aumento de vendas. Não alegar exclusividade de vídeo, QR, NFC ou métricas.

## 3. A experiência que o fundador pediu

O fundador insistiu diversas vezes que o cardápio precisava parecer um Reels de verdade. Preserve essa decisão ao evoluir a interface:

- Um produto por tela, com a mídia ocupando o espaço principal.
- Deslize **vertical** para trocar de produto e **lateral** para trocar de categoria.
- Nome, preço e controles discretos sobrepostos à mídia.
- Não transformar o feed em uma lista de cards com grandes botões de compra permanentes.
- Detalhes, personalização, sacola, busca e comentários aparecem em painéis quando acionados.
- Manter uma alternativa de lista tradicional, acessível e utilizável em rede lenta.
- Vídeo ativo inicia sem som quando o navegador permite. Respeitar movimento reduzido, pausa, áudio e bloqueios de autoplay.
- Pausar mídia fora da tela, com a aba oculta ou em situações em que não deve continuar reproduzindo.
- Fotos também são conteúdo válido do feed e precisam ter métricas próprias.

Na gestão, o dono escolhe **foto ou vídeo do dispositivo no mesmo fluxo de cadastro**. O usuário rejeitou exigir que o restaurante colasse um link de vídeo. URL de reprodução e upload são detalhes internos.

A orientação visual atual é vermelho fechado, fundos claros/quentes, comida em destaque, Manrope e controles legíveis. Cliente prioriza celular; gestão prioriza tablet/computador, mantendo adaptação a celular. Os documentos de design trazem referências; o comportamento de Reels solicitado depois prevalece sobre esboços antigos que sugerem outra composição.

## 4. Jornada do cliente

1. Escaneia o QR de uma mesa ou abre o link público do restaurante.
2. Navega por produtos publicados e categorias visíveis, sem conta obrigatória.
3. Vê preço, descrição, ingredientes, alergênicos, disponibilidade e mídia.
4. Pode curtir e comentar antes de pedir, se o restaurante permitir.
5. Abre os detalhes, escolhe quantidade, retiradas de ingredientes, adicionais e observação.
6. Adiciona à sacola. Combinações diferentes do mesmo produto ficam separadas.
7. Confere a sacola e finaliza informando mesa, nome e telefone/WhatsApp.
8. Escolhe separadamente se aceita marketing; esse campo começa desmarcado e não é obrigatório.
9. O servidor valida tudo e grava o pedido. Somente depois da confirmação persistida aparece sucesso.
10. Acompanha o status no mesmo navegador/sessão.
11. Depois da entrega, pode acessar as interações dos itens e o convite para avaliar no Google, se configurado.

**Pagamento ocorre no estabelecimento.** Não existe pagamento online ou confirmação financeira automática. Valor de pedidos não deve ser chamado de faturamento efetivamente recebido.

## 5. Ingredientes e opcionais

São duas funcionalidades distintas:

### Ingredientes removíveis

O dono informa, por produto, o que o cliente pode retirar, por exemplo cebola, tomate e alface. Os checkboxes começam marcados, indicando ingredientes incluídos. Desmarcar significa retirar, **sem desconto automático**. A descrição geral de ingredientes e os alergênicos são campos separados.

### Adicionais/opcionais

A gestão tem uma aba própria para cadastrar nome, preço unitário, disponibilidade e produtos vinculados. Um adicional pode ser gratuito. A interface informa onde cada opcional é utilizado.

Exemplo ilustrativo: lanche de R$ 25 + bacon de R$ 5 = R$ 30 por unidade. Duas unidades dessa combinação totalizam R$ 60. O exemplo explica a regra; não é um preço comercial fixo do sistema.

O cliente marca adicionais antes de colocar na sacola. O servidor verifica se continuam ativos, se pertencem ao restaurante e se estão vinculados ao produto. Preço ou composição alterados exigem revisão, sem aceitar cegamente o valor enviado pelo navegador.

O pedido guarda uma fotografia dos nomes/preços/adicionais/retiradas no momento da compra. Alterar o cadastro depois não modifica pedidos antigos. A cozinha e o acompanhamento mostram as escolhas.

Não há ainda grupos complexos de complementos, limites mínimo/máximo por grupo, combos ou múltiplas quantidades do mesmo adicional dentro de uma unidade.

## 6. Gestão do restaurante

Cardápio público e gestão são áreas separadas. A gestão exige login e associação ao restaurante no servidor. Não adicionar um acesso administrativo desprotegido no cardápio.

Capacidades atuais do ambiente conectado:

- Cadastro inicial do restaurante; começa com recebimento de pedidos pausado.
- Visão geral e quadro de pedidos.
- Produtos: preço, descrição, ingredientes, retiradas, alergênicos, foto/vídeo, categoria, publicação, disponibilidade e arquivamento.
- Categorias com ordenação, visibilidade e organização dos produtos.
- Opcionais e respectivos vínculos.
- Configurações: dados do restaurante, horários, fuso, pausa de pedidos, mesas, contato de privacidade e link de avaliação do Google.
- Links e QR por mesa.
- Contatos e situação de consentimento de marketing.
- Métricas de fotos e vídeos.
- Avaliações: desligar interações sociais e ocultar/restaurar comentários.

Papéis: `owner` e `operations`. O dono possui permissões de gestão; operação tem acesso necessário aos pedidos. A inclusão de membros ainda depende de administração no Supabase; não existe fluxo completo de convite da equipe dentro do app.

Status do pedido:

```text
recebido → em_preparo → pronto → entregue
     └────────┴──────→ cancelado, com motivo nas transições permitidas
```

O avanço valida estado esperado e transição no banco, para evitar conflitos entre atendentes. Estimativa de preparo é manual, não uma previsão de IA.

## 7. QR, mesas e isolamento entre restaurantes

O QR contém o endereço do restaurante e o número da mesa. Exemplo:

```text
https://cardap-io-lilac.vercel.app/r/restaurante-a?mesa=4
https://cardap-io-lilac.vercel.app/r/restaurante-b?mesa=4
```

São QRs diferentes, mesmo que ambos usem “Mesa 4”. O `slug` identifica o restaurante público. O servidor usa o UUID do restaurante e da mesa, validando o vínculo. Nunca confiar somente no número da mesa.

Sacola, tentativas pendentes e histórico local usam chaves que incluem `restaurant.id`. Cookies de visitante também são específicos por restaurante (`guest_<id>`, com caminho de API correspondente). Consultas e alterações no banco devem manter `restaurant_id`, RLS e vínculos consistentes.

Se o cliente abrir o QR do restaurante B, passa a navegar em B; não deve levar itens, pedidos, sessão ou dados privados de A para B. Se abrir um link antigo de A enquanto está fisicamente em B, continuará vendo A. **QR não verifica localização nem presença física.** Essa diferença é importante: isolamento de dados está implementado; prova de presença, QR rotativo ou validação pela equipe não estão implementados.

NFC simplesmente abre o mesmo endereço. Gravar a tag exige equipamento/etapa física externa ao aplicativo.

## 8. Curtidas, comentários e Google Meu Negócio

A decisão final do usuário é permitir curtir e comentar **antes da compra**. Houve uma versão anterior que exigia pedido entregue: não reintroduzir essa restrição.

- Visitante pode ler interações públicas de pratos publicados.
- Interagir cria/reutiliza sessão anônima do navegador, sem cadastro obrigatório.
- Coração do Reels salva curtida com um toque; comentário tem envio explícito.
- Uma curtida e um comentário por sessão e produto; comentário até 1.000 caracteres.
- O visitante pode editar/remover sua interação enquanto sua sessão estiver válida.
- A sessão expira em até 12 horas desde sua criação. Não recuperar acesso pelo telefone.
- Comentários aparecem como “Visitante”, sem nome/telefone do checkout.
- Indicação de compra verificada só quando o servidor confirma pedido entregue daquele produto na mesma sessão.
- O dono pode desligar curtidas/comentários do restaurante, ocultando os controles e conteúdo público, sem apagar o histórico.
- Pode ocultar/restaurar comentários individualmente. Ocultar comentário não remove a curtida; editar comentário ocultado não o republica automaticamente.
- O público recebe até 20 comentários recentes; a gestão até 200 avaliações recentes. Não confundir amostra exibida com todos os registros históricos.

“Compartilhar no Google” foi esclarecido como avaliar no **Google Meu Negócio / Perfil da Empresa no Google**. Cada restaurante cadastra seu próprio link. Se estiver vazio, não mostramos o convite.

O convite aparece após entrega e não depende de avaliação positiva. Abre o Google em outra aba para o cliente escrever/publicar com sua conta. **Não há integração de publicação automática, cópia de comentários, importação ou sincronização de avaliações do Google.**

## 9. Fotos, vídeos e métricas

### Armazenamento atual

O planejamento inicial usava Cloudflare Stream. O fundador decidiu testar sem contratar o serviço; **novos uploads usam Supabase Storage**.

- Vídeos no bucket `restaurant-videos`: MP4/H.264 ou WebM, até 45 segundos e 20 MB.
- Fotos no bucket `restaurant-media`: JPEG/PNG/WebP, até 5 MB no ambiente conectado.
- Backend valida dono/produto/restaurante e autoriza um caminho exclusivo de upload.
- Arquivo é enviado diretamente do navegador ao Storage; não atravessa uma função Vercel como upload grande.
- Publicação do vídeo depende de confirmação do objeto no servidor.
- O servidor verifica existência, tamanho e MIME; a duração é medida no navegador e validada, mas não há inspeção independente completa dos codecs/duração no backend.
- Não existe transcodificação automática nem streaming adaptativo para os vídeos novos do Storage.
- Cloudflare permanece apenas para compatibilidade/sincronização de ativos antigos, se configurado. Não exigir sua contratação para testar novos uploads.
- Arquivos publicados são públicos para reprodução no cardápio. Não usar esses buckets para documentos pessoais.

### Métricas de produto

Vídeos: visualizações qualificadas, tempo assistido, cobertura/conclusão e associação com sacola/pedido. A coleta considera visibilidade e reprodução efetiva; pausa, buffering, aba oculta e saltos de reprodução não devem inflar os números. Conclusão usa cobertura de trechos, não apenas chegar ao fim do vídeo.

Fotos: visualizações qualificadas, tempo visível total/médio e associação com sacola/pedido. Foto carregada, ao menos 50% visível e um segundo de exposição com aba ativa qualificam a observação. Não chamar tempo de foto de “tempo assistido de vídeo”.

Métricas excluem prévias administrativas/demonstração nos fluxos aplicáveis. Uma observação não é uma pessoa única. Versões de mídia e troca de foto preservam histórico. Dados são estimativas do navegador, sujeitos a perdas e manipulação; não são auditoria financeira.

Associação significa que a mesma sessão observou um produto e também o adicionou/pediu no período. **Não comprova causalidade, pagamento ou aumento de faturamento**; inclui pedidos cancelados. Não renomear essa métrica para conversão comprovada sem mudar a definição e a coleta.

## 10. Contatos, identificação e consentimento

Nome/telefone no checkout são para atendimento. O número digitado não é verificado, não autentica o visitante e não libera histórico de pedidos.

Marketing é opcional, desmarcado por padrão, com registro de escolha/revogação. Fazer outro pedido não deve reativar consentimento revogado ou sobrescrever a identidade de um contato existente sem regra apropriada.

O dono consulta contatos do próprio restaurante. Ainda não existem campanhas automáticas de WhatsApp. Retenção informada nas configurações não implementa exclusão automática; esse processo está pendente.

## 11. Arquitetura técnica

Um único projeto Next.js contém interface pública, gestão e APIs. Não são duas aplicações independentes que precisam de bancos separados: ambas usam o mesmo backend, respeitando autenticação e contexto do restaurante.

Versões conferidas em `package.json` nesta transferência:

| Tecnologia                              | Uso                                                          |
| --------------------------------------- | ------------------------------------------------------------ |
| Next.js 16.4.0 / React 19.3.0           | App Router, componentes, páginas e handlers                  |
| TypeScript 6.0.3                        | Tipagem                                                      |
| Tailwind 4 / Radix / componentes locais | Interface                                                    |
| Supabase JS / SSR                       | PostgreSQL, Auth, Storage, Realtime                          |
| Zod 4.6.6                               | Validação de entradas                                        |
| HLS.js                                  | Reprodução compatível com mídias legadas                     |
| Pino 10.4.0                             | Observabilidade implementada localmente, ainda não publicada |
| Playwright / PGlite                     | Testes de navegador e banco embarcado                        |
| Vercel                                  | Hospedagem utilizada                                         |

Fluxo simplificado:

```text
Cliente /r/[slug] ─┐
                  ├─ Next.js APIs ─ Auth + validação + contexto do restaurante
Gestão /gestao ────┘                         │
                                    Supabase PostgreSQL
                                    RLS + funções transacionais
                                            │
                               Realtime / consultas de reconciliação

Upload: navegador ─ autorização da API ─ envio direto ao Supabase Storage
```

**Atenção ao Next:** `AGENTS.md` exige ler os guias relevantes em `node_modules/next/dist/docs/` antes de escrever código. Não assumir APIs/convenções de versões antigas. O projeto usa `src/proxy.ts`, não simplesmente o antigo middleware.

### Rotas principais

| Rota                                 | Função                                              |
| ------------------------------------ | --------------------------------------------------- |
| `/`                                  | Encaminha para entrada/gestão conforme autenticação |
| `/login`                             | Login/cadastro/recuperação                          |
| `/auth/confirm` e `/redefinir-senha` | Confirmação e redefinição                           |
| `/gestao`                            | Entrada e onboarding do gestor                      |
| `/gestao/[id]`                       | Gestão autorizada do restaurante                    |
| `/r/[slug]`                          | Cardápio público real                               |
| `/r/[slug]/pedido/[id]` e `/pedidos` | Acompanhamento e lista no contexto do cardápio      |
| `/r/[slug]/privacidade`              | Informações de privacidade                          |
| `/r/demo` e `/demo/gestao`           | Demonstração local isolada; gestão exige login      |

APIs estão em `src/app/api`: autenticação, senha, onboarding, catálogo público; por restaurante, workspace, catálogo gerenciável, sessão de visitante, pedidos, mídia, visualizações de foto/vídeo, eventos de sacola, associações, consentimento e feedback por produto. Leia os schemas Zod de cada handler antes de alterar contratos.

### Banco

Grupos principais de tabelas:

- `restaurants`, `restaurant_members`, `dining_tables`.
- `categories`, `products`, `product_media`.
- `product_options`, `product_option_links`.
- `guest_sessions`, `orders`, `order_items`, `order_status_events`.
- `contacts`, `marketing_consent_events`.
- `video_view_sessions`, `photo_view_sessions`, `cart_add_events`.
- `product_feedback`.

Migrations 001–009 em `supabase/migrations`: fundação; gestão conectada; observações de vídeo; associações; armazenamento de vídeo; métricas de foto; opcionais; feedback inicial; feedback social/moderação. A migration 009 altera a regra anterior de compra obrigatória. O histórico do trabalho registra aplicação no projeto hospedado até 009; **verifique o estado real antes de executar qualquer migration**, sem reaplicar cegamente arquivos já usados.

`place_guest_order` realiza validação e persistência transacional. A chave de idempotência e o hash do payload evitam pedidos duplicados em retries. `advance_order` valida transições concorrentes. Funções privilegiadas devem continuar validando sessão/tenant/permissões; uma chave de servidor ignora RLS e não substitui essas verificações.

Realtime auxilia a gestão, com reconciliação por consulta a cada 15 segundos. O cardápio conectado também atualiza em torno de 15 segundos quando visível; acompanhamento consulta a cada 5 segundos. Não prometer atualização instantânea ou processamento offline.

## 12. Demonstração versus aplicação real

Este foi um motivo recorrente de confusão do usuário:

- `/r/demo` usa fixtures e persistência do navegador, com namespace `brasa:demo:v1` e mídia local/IndexedDB quando aplicável.
- O estado da demo em localhost não é o estado da demo na Vercel, pois são origens diferentes.
- Outro navegador também possui outra demonstração.
- Para mostrar dados reais entre dispositivos, usar o slug real e o Supabase conectado.
- Não preencher automaticamente um restaurante real com fixtures nem mostrar sucesso simulado como operação real.

Embora componentes compartilhem tipos/contextos com nomes históricos como `DemoContext`, o provedor conectado deve continuar usando APIs e persistência real para pedidos. Não deduzir o backend apenas pelo nome de um componente.

## 13. Segurança e observabilidade

Proteções existentes incluem validação server-side, origem de mutações, sessão autenticada de gestão, sessão de visitante em cookie HttpOnly/SameSite Strict/Secure em produção, isolamento por restaurante, RLS, idempotência e acesso ao pedido restrito à sessão. Cookies de visitante expiram em 12 horas; o banco guarda hash do token.

**Não foi concluído um pentest ou uma varredura integral de segurança.** Os testes realizados cobrem fluxos e riscos específicos; não afirmar aprovação geral de produção.

A alteração mais recente implementou observabilidade no código local:

- Pino JSON com níveis `info`, `warn`, `error`, `fatal`.
- Wrapper em 20 métodos de API e callback de autenticação.
- `requestId` gerado pelo servidor, ação estática, status, duração e cabeçalho `X-Request-ID`.
- `userId` pseudonimizado por HMAC quando há `LOG_HASH_KEY`; omitido sem essa chave.
- Lista fechada de campos/eventos/códigos. Não serializar senhas, tokens, headers, cookies, corpos, URLs, nomes, telefones, e-mails, comentários ou erros brutos/stack/cause.
- Erros inesperados classificados como 500, dependências indisponíveis como 503 e rejeições conhecidas como 4xx.
- Tratamento de falhas antes silenciosas em logout, consultas e sincronização de vídeo.
- `src/instrumentation.ts` para erros do servidor; ESLint impede `console.*` em `src` e importação direta de Pino fora do módulo aprovado.

Ler `docs/observability.md`. Persistem lacunas: falhas exclusivamente no navegador, coleta central/retenção/alertas e correlação distribuída. A sanitização da fachada não garante a sanitização de logs nativos da Vercel/Next/Supabase ou de registros históricos. Pseudonimização também não equivale a anonimização.

## 14. Estado exato desta transferência

Pasta local:

```text
C:\Users\medei\OneDrive\Desktop\work\mvp-web
```

Repositório: https://github.com/medeiroswrld/cardap.io

Site utilizado: https://cardap-io-lilac.vercel.app

Branch local: `main`. Último commit conferido: `adb4593` — `Allow social feedback before orders with restaurant moderation`.

Há alterações locais **não commitadas e não publicadas** da revisão de observabilidade, incluindo mudanças em handlers, dependências, configuração ESLint, logger, instrumentação e testes. Preserve-as. Este documento é uma adição de documentação. Não usar reset/checkout/clean para “resolver” o working tree sem analisar e preservar o trabalho.

No histórico, o site recebeu as funcionalidades sociais antes dessa revisão. O estado remoto e o deploy atual não foram revalidados em 21/10; confirme GitHub/Vercel antes de dizer que uma mudança está publicada. Não confundir testes locais aprovados com deploy concluído.

Última verificação de observabilidade, realizada na etapa anterior: 9 testes automatizados aprovados, lint, TypeScript, build com webpack e três verificações HTTP locais aprovados. `npm audit --omit=dev` não apontou vulnerabilidades conhecidas; audit completo indicou cinco entradas altas na cadeia de desenvolvimento do ESLint/Next. São resultados daquela execução, não uma garantia permanente.

## 15. Mapa para encontrar o código

| Área                                | Arquivos/pastas                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Feed e navegação                    | `src/components/immersive-menu.tsx`, `menu-app.tsx`, `product-media.tsx`                         |
| Estado conectado, sacola e checkout | `src/components/connected-menu-provider.tsx`                                                     |
| Gestão conectada                    | `src/components/connected-admin.tsx`                                                             |
| Demonstração                        | `src/components/demo-provider.tsx`, `admin-app.tsx`, `src/lib/fixtures.ts`                       |
| Ingredientes/opcionais              | `product-options-admin.tsx`, `order-choices.tsx`, `src/lib/product-options.ts`                   |
| Social e moderação                  | `product-feedback.tsx`, `feedback-admin.tsx`, `src/lib/feedback.ts`                              |
| Mídia/upload                        | `media-picker.tsx`, `video-uploader.tsx`, `src/lib/sync-video.ts`, `video-config.ts`             |
| Métricas                            | `use-video-observation.ts`, `use-photo-observation.ts`, `video-metrics.tsx`, `photo-metrics.tsx` |
| Catálogo/tipos                      | `src/lib/catalog.ts`, `connected-types.ts`, `types.ts`                                           |
| Auth/segurança                      | `src/lib/supabase/`, `server-security.ts`, `guest-session.ts`, `src/proxy.ts`                    |
| Observabilidade                     | `src/lib/observability/`, `src/instrumentation.ts`, `scripts/test-observability.mjs`             |
| Banco                               | `supabase/migrations/`, `supabase/tests/`, `scripts/test-database.mjs`                           |
| Fluxos de navegador                 | `tests/`                                                                                         |

Documentos de referência: `PRODUCT.md`, `README.md`, `ARQUITETURA.md`, `TELAS-E-DESIGN.md`, `DESIGN.md`, `ACEITE-E-PILOTO.md`, `CHECKPOINT.md`. Alguns trechos são históricos: Cloudflare obrigatório, feedback somente depois da entrega e descrições de “planejamento sem implementação” já foram superados. Confronte documentação, migrations mais recentes e código.

## 16. Ambiente e testes

Variáveis em `.env.example`; valores reais ficam em `.env.local` e nos serviços de hospedagem, nunca neste documento:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
CLOUDFLARE_ACCOUNT_ID             # opcional para legado
CLOUDFLARE_STREAM_API_TOKEN       # opcional para legado
LOG_LEVEL
LOG_HASH_KEY                     # segredo exclusivo para pseudonimização
```

Não imprimir, copiar para documentação, commitar ou enviar credenciais em respostas. Há credenciais compartilhadas no histórico antigo da conversa: trate rotação/inventário como pendência de segurança, sem reutilizá-las em exemplos ou afirmar que já foram revogadas.

Comandos úteis:

```sh
npm ci
npm run dev -- --port 3101
npm run lint
npm run typecheck
npm run test:observability
npm run test:database
npm run build -- --webpack
```

Webpack foi usado porque o build Turbopack apresentou problemas neste Windows. A porta 3000 já teve conflito com outro projeto do usuário; use uma porta livre e confirme a aplicação servida. `NEXT_PUBLIC_APP_URL`, origem do teste e build precisam ser coerentes para validação de origem.

Playwright permite `PLAYWRIGHT_BASE_URL` e `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Testes conectados (`connected-live`, `options-live`, `feedback-live`) são opt-in com `RUN_CONNECTED_LIVE=1`, criam dados temporários e usam limpeza. Leia escopo e autorização antes de executar contra serviços reais. Não executar duas suítes Playwright ao mesmo tempo nem remover dados do restaurante real.

## 17. O que falta para amadurecer e escalar

Não apresentar o produto como SaaS acabado. Prioridades:

1. **Concluir publicação da revisão local:** revisar diff, preservar trabalho existente, validar, enviar ao GitHub/deploy quando solicitado e verificar o resultado real. Configurar `LOG_HASH_KEY` com segredo aleatório exclusivo para habilitar contexto pseudonimizado de usuário.
2. **Piloto operacional controlado:** restaurante real, mesas corretas, fotos/vídeos, horários, treinamento e atendimento alternativo em falhas de rede. Testar do QR à entrega em dispositivos diferentes.
3. **Autenticação por e-mail:** as telas/rotas existem, mas entrega confiável depende de SMTP. Resend foi discutido e adiado por falta de domínio próprio. O endereço `vercel.app` não é um domínio DNS controlado pelo usuário para verificar remetente no Resend. Não afirmar que Resend está conectado.
4. **Proteção contra abuso:** limite por IP/origem e criação de sessões; limites de interações sociais, spam e uso excessivo de métricas. O limite por sessão de pedidos não resolve criação de várias sessões.
5. **Segurança:** revisão completa de autorização/RLS/Storage, dependências, gestão de segredos e rotação do que foi exposto; testar isolamento entre restaurantes e papéis.
6. **Operação:** backups, teste real de restauração, retenção/exclusão, suporte e procedimento de incidentes.
7. **Observabilidade:** destino central, alertas, monitoramento seguro do navegador e metas de disponibilidade/latência.
8. **Escala de dados:** paginação e agregação no banco. Workspace hoje limita amostras (pedidos, contatos, avaliações e métricas); não tratar a amostra como histórico completo. Evitar transferir milhares de eventos para cada consulta da gestão.
9. **Escala de mídia:** orçamento/franquias por restaurante, armazenamento acumulado, tráfego, limpeza segura de versões sem uso e eventual processamento dedicado. Não prometer armazenamento ilimitado/grátis.
10. **SaaS comercial:** planos, limites, cobrança, convites de equipe, onboarding assistido e domínio/marca. Validar preços com restaurantes antes de fixar o modelo.

Fora do MVP atual: delivery, integração com PDV, pagamentos online, disparos automáticos de WhatsApp, previsão por IA, aplicativo nativo, editor de vídeo, painel de agência e combos complexos. Essas possibilidades não são requisitos já aprovados para implementação imediata.

## 18. Como continuar sem perder a intenção do produto

- Trabalhe sobre a aplicação existente; não recrie do zero nem troque a stack sem necessidade.
- Preserve a experiência de Reels e a separação entre cardápio e gestão protegida.
- Preserve upload direto de arquivo no cadastro, métricas de foto e vídeo, ingredientes/opcionais e interações sociais antes da compra.
- O dono controla tanto habilitação social quanto moderação individual.
- Não prometer confirmação antes de persistir o pedido; não confiar em preço, mesa ou tenant enviados pelo cliente.
- Distinguir demo, local conectado e produção em toda comunicação com o usuário.
- Relatar claramente: implementado, testado localmente, publicado ou pendente. Não atribuir ao projeto serviços/funcionalidades apenas discutidos.
- O fundador prefere execução prática e pouca repetição de perguntas. Faça perguntas quando uma decisão realmente faltar, sem solicitar novamente informações já presentes no projeto.

Ao receber este contexto, primeiro inspecione `AGENTS.md`, este documento, `git status`, os arquivos alterados e a solicitação atual do usuário. Apresente o entendimento e continue o trabalho solicitado, preservando alterações existentes. Este handoff, por si só, não solicita reescrever o sistema, publicar, contratar serviços ou executar testes destrutivos.
