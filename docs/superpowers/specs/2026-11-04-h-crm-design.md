# Subprojeto H — CRM gastronômico

Data: 04/11/2026. Branch: `melhorias/h-crm`, criada a partir de `origin/main` (`34d9ccd`, que já contém os subprojetos A e G em produção).

Roteiro: A (fundação, em produção) → G (pedidos online, em produção) → **H (CRM)** → C (identidade) → F (escala) → E (agência) → D (vendas); o restante do antigo B depois.

## Objetivo

Transformar a aba **Contatos** num CRM do restaurante: ver cada cliente com histórico e valor, separar automaticamente em segmentos (novo, recorrente, VIP, sumido, sem pedidos), anotar e etiquetar, montar listas de campanha para WhatsApp respeitando o consentimento, e atender pedidos de exclusão de dados (LGPD).

Critérios de sucesso:

- O dono vê a lista de clientes com número de pedidos, total gasto, último pedido e segmento corretos para **todo o histórico**, não apenas os últimos 200 pedidos.
- Pedidos `recusado` e `cancelado` não contam como pedido nem como gasto.
- O dono ajusta as regras dos segmentos e a lista reflete o ajuste na próxima consulta.
- Uma lista de campanha contém **somente** clientes com marketing autorizado; o CSV exportado também.
- "Excluir dados do cliente" remove os dados pessoais do cliente e mantém valores/itens dos pedidos; é bloqueado se o cliente tiver pedido em andamento.
- Somente o dono acessa o CRM (equipe de operação não).
- Nenhuma regressão em pedidos de mesa, pedidos online, gestão e demonstração.

## Decisões do usuário (04/11/2026)

- Comunicação: **links e exportação** — botão "Abrir no WhatsApp" com mensagem pronta por cliente e exportação CSV. Sem disparo automático nem API do WhatsApp Business.
- Segmentos: **regras padrão ajustáveis** pelo dono em Configurações.
- LGPD: **botão de exclusão de dados** na ficha do cliente.
- Arquitetura: **cálculo no banco** (funções no Postgres), não na tela nem em tabela de resumo.

## 1. Dados (migration `012_crm.sql`)

Nada é alterado nas migrations anteriores.

**`contacts`** — novas colunas:
- `tags text[] not null default '{}'` — até 10 etiquetas, cada uma com 1–30 caracteres após `trim`, sem repetição (case-insensitive). Validado por função `valid_crm_tags(text[])` usada em `check`.
- `notes text not null default '' check (length(notes) <= 2000)`.

**`restaurants`** — novas colunas (regras dos segmentos), com padrões:
- `crm_recurring_min_orders integer not null default 2 check (between 2 and 50)`
- `crm_recurring_days integer not null default 60 check (between 7 and 365)`
- `crm_vip_min_orders integer not null default 5 check (between 2 and 100)`
- `crm_vip_min_spent_cents integer not null default 50000 check (between 0 and 100000000)`
- `crm_vip_days integer not null default 90 check (between 7 and 365)`
- `crm_lapsed_days integer not null default 30 check (between 7 and 365)`

**`data_erasure_events`** (nova): `id uuid pk`, `restaurant_id uuid not null references restaurants on delete cascade`, `actor_id uuid references auth.users`, `orders_affected integer not null`, `created_at timestamptz not null default now()`. Sem nenhum dado pessoal do cliente. RLS: somente o dono lê; escrita só pela função de exclusão.

**Índice:** `orders(restaurant_id, customer_phone, created_at desc)` para as agregações.

### Regras de cálculo

Para cada contato (`restaurant_id`, `phone`), considerando somente pedidos do mesmo restaurante e mesmo telefone com `status not in ('recusado','cancelado')` ("pedidos válidos"):

- `orders_count`, `spent_cents` (soma de `total_cents`, incluindo taxa de entrega), `avg_ticket_cents` (inteiro, arredondado), `first_order_at`, `last_order_at`.
- `orders_in_recurring_window` (pedidos válidos nos últimos `crm_recurring_days`), `orders_in_vip_window` e `spent_in_vip_window` (últimos `crm_vip_days`).

Segmento (primeira regra que se aplica, nesta ordem):

1. **`sem_pedidos`** — `orders_count = 0`.
2. **`sumido`** — `last_order_at < now() - crm_lapsed_days`.
3. **`vip`** — `orders_in_vip_window >= crm_vip_min_orders` **ou** (`crm_vip_min_spent_cents > 0` e `spent_in_vip_window >= crm_vip_min_spent_cents`).
4. **`recorrente`** — `orders_in_recurring_window >= crm_recurring_min_orders`.
5. **`novo`** — demais casos (inclui cliente antigo com 1 pedido recente e cliente com vários pedidos espaçados que ainda não sumiu).

A regra existe em um só lugar: a função SQL. A tela apenas exibe o segmento retornado.

### Funções (todas `security definer`, `set search_path=public`, somente o dono: `is_member(p_restaurant, true)`; `grant execute ... to authenticated`)

- **`crm_customers(p_restaurant uuid, p_search text, p_segment text, p_tag text, p_marketing_only boolean, p_sort text, p_limit integer, p_offset integer) returns jsonb`**
  - `p_search`: trecho do nome (sem diferenciar maiúsculas — `lower`; acentos são comparados como digitados) ou dígitos do telefone; nulo = todos.
  - `p_segment`: um dos cinco segmentos ou nulo; `p_tag`: etiqueta exata (case-insensitive) ou nulo; `p_marketing_only`: só `marketing_status = 'authorized'`.
  - `p_sort`: `last_order` (padrão; nulos por último), `spent`, `orders`, `name`.
  - `p_limit` 1–100 (padrão da tela 50), `p_offset` ≥ 0.
  - Retorna `{ total, segments: {novo, recorrente, vip, sumido, sem_pedidos}, customers: [{ id, name, phone, marketing_status, tags, orders_count, spent_cents, avg_ticket_cents, first_order_at, last_order_at, segment }] }`. `total` respeita os filtros; `segments` conta todo o restaurante (para os cartões do topo), ignorando filtros.
- **`crm_customer(p_restaurant uuid, p_contact uuid) returns jsonb`** — a linha do cliente como acima, mais `notes`, `favorites` (até 3 `{product_name, quantity}` por soma de quantidade nos pedidos válidos), `fulfillment_mix` (`{mesa, retirada, entrega}` contagem de pedidos válidos), `addresses` (até 3 endereços distintos mais recentes de `order_addresses`: `{zone_name, street, number, complement, reference}`), `orders` (últimos 20 pedidos de qualquer status: `{id, number, created_at, status, fulfillment, total_cents}`). Contato de outro restaurante → `NOT_FOUND`.
- **`crm_save_customer(p_restaurant uuid, p_contact uuid, p_tags text[], p_notes text) returns void`** — normaliza etiquetas (`trim`, sem repetidas ignorando caixa) e salva.
- **`crm_campaign(p_restaurant uuid, p_segment text, p_tag text) returns jsonb`** — clientes com `marketing_status = 'authorized'` que atendem segmento/etiqueta (ambos opcionais, mas ao menos um obrigatório → senão `INVALID_INPUT`), até 1.000 linhas: `[{ id, name, phone, segment, last_order_at, spent_cents }]`, ordenados por `last_order_at desc`.
- **`crm_save_settings(p_restaurant uuid, p_settings jsonb) returns void`** — grava as seis regras (validação pelos `check`; `vip_days >= recurring_days` não é exigido).
- **`crm_erase_customer(p_restaurant uuid, p_contact uuid) returns jsonb`** — LGPD:
  - Se existir pedido do mesmo telefone com status em andamento (`aguardando_aceite`, `recebido`, `em_preparo`, `pronto`, `saiu_para_entrega`) → `CUSTOMER_HAS_OPEN_ORDERS`.
  - Remove `order_addresses` dos pedidos desse telefone; atualiza esses pedidos para `customer_name = 'Cliente removido'` e `customer_phone = ''` (valores, itens, status e datas preservados); remove `marketing_consent_events` do contato; remove o contato (com etiquetas e anotações).
  - Insere `data_erasure_events` com `orders_affected`; retorna `{ orders_affected }`.
  - Irreversível.

`revoke_marketing` existente continua sendo usado na ficha.

## 2. API

- `GET /api/restaurants/[id]/crm?search=&segment=&tag=&marketing=1&sort=&page=` → `crm_customers` (página de 50). Somente dono (`requireMember(id, true)`); entrada validada com Zod.
- `GET /api/restaurants/[id]/crm/[contactId]` → `crm_customer`.
- `POST /api/restaurants/[id]/crm/[contactId]` com `{ action: "save", tags, notes }` → `crm_save_customer`; `{ action: "erase", confirm: "EXCLUIR" }` → `crm_erase_customer`.
- `GET /api/restaurants/[id]/crm/campaign?segment=&tag=` → `crm_campaign`.
- `POST /api/restaurants/[id]/catalog` ganha a ação `crm_settings` → `crm_save_settings` (não invalida o catálogo público; entra na lista de exceções junto de `revoke_marketing`/`moderate_feedback`).
- Todas: `checkOrigin` nas mutações, respostas `no-store`, erros pelo `apiError` existente; códigos novos `CUSTOMER_HAS_OPEN_ORDERS` (409) na lista fechada de `src/lib/observability/core.ts` com mensagem em português em `src/lib/client-api.ts`. Nenhum nome, telefone, anotação ou etiqueta em logs.
- O `workspace` deixa de carregar `contacts` (a aba Clientes busca pela nova API, paginada); demais dados do workspace inalterados.

## 3. Interface (gestão, somente dono)

- A aba **Contatos** passa a se chamar **Clientes** (mesma posição no menu; mesmo ícone).
- **Topo:** cinco cartões com a contagem por segmento (Novos, Recorrentes, VIP, Sumidos, Sem pedidos); clicar filtra a lista.
- **Lista:** busca (nome ou telefone, com atraso de 300 ms), filtros de segmento, etiqueta e "Só quem autorizou marketing", ordenação (último pedido, total gasto, nº de pedidos, nome), 50 por página com "Anterior/Próxima". Cada linha: nome, WhatsApp, segmento, pedidos, total gasto, último pedido, etiquetas.
- **Ficha** (painel/modal acessível): indicadores, favoritos, como costuma pedir, últimos endereços, últimos 20 pedidos (com o rótulo de status de `order-flow.ts`), etiquetas (adicionar/remover), anotações (com contador de caracteres), consentimento de marketing com "Revogar autorização" (existente), botão "Conversar no WhatsApp" (abre `https://wa.me/55<telefone>` sem texto), e "Excluir dados do cliente" (modal que exige digitar `EXCLUIR`; mostra o erro de pedido em andamento quando houver).
- **Campanhas** (seção na mesma aba): escolher segmento e/ou etiqueta; mensagem com `{nome}` (até 1.000 caracteres; `{nome}` vira o primeiro nome); aviso "Somente clientes que autorizaram receber ofertas aparecem aqui"; lista com "Abrir no WhatsApp" por cliente (`https://wa.me/55<telefone>?text=<mensagem>`, nova aba, `rel="noopener noreferrer"`); "Exportar CSV" (colunas: nome, whatsapp, segmento, ultimo_pedido, total_gasto; separador `;`, BOM UTF-8 para abrir no Excel em português; valores com `;`, aspas ou quebra de linha entre aspas; células iniciadas por `=`, `+`, `-`, `@` prefixadas com `'` para evitar fórmula).
- **Configurações → Segmentos de clientes:** os seis números com explicação curta e "Restaurar padrão".
- Acessibilidade: teclado, leitor de tela, foco visível, controles ≥ 44×44 px; cartões de segmento são botões com `aria-pressed`.

## 4. Privacidade

- Anotações e etiquetas são dados pessoais visíveis só ao dono; o texto da tela orienta não registrar dados sensíveis (saúde, religião etc.).
- Páginas de privacidade passam a mencionar que o restaurante pode manter histórico de pedidos, etiquetas e anotações para atendimento e que o cliente pode pedir a exclusão ao restaurante.
- Exportação CSV contém somente clientes com marketing autorizado.

## 5. Testes

- **Banco (PGlite, novo `scripts/test-crm.mjs` incluído em `npm run test:database`):** totais e médias ignorando `recusado`/`cancelado`; taxa de entrega incluída; cada segmento com datas controladas, incluindo prioridade (sumido antes de VIP) e regra por valor; regras ajustadas mudam o segmento; busca, filtros, ordenação e paginação; `segments` conta o restaurante inteiro; favoritos, mix e endereços; `crm_campaign` exclui não autorizados e exige um filtro; normalização de etiquetas e limites; exclusão bloqueada com pedido aberto, e quando permitida anonimiza pedidos, remove endereços, consentimentos e o contato, e registra o evento sem dados pessoais; isolamento entre restaurantes e bloqueio para operação e anônimo em todas as funções.
- **Unitários (`node:test`):** CSV (BOM, separador, escape, proteção contra fórmula), preenchimento de `{nome}` (primeiro nome; nome vazio), montagem dos links de campanha.
- **Playwright:** regressão completa; teste opt-in `RUN_CONNECTED_LIVE=1` que cria restaurante temporário com pedidos de clientes distintos, abre Clientes, confere segmento/totais, edita etiqueta e anotação, monta campanha e exclui um cliente; limpeza no `finally`.

## Implantação

A migration 012 deve ser aplicada no Supabase **antes** de publicar o código (o código novo chama as funções novas). Com a 012 aplicada e o código antigo no ar, nada quebra (só acrescenta colunas, tabela e funções).

## Fora do escopo

Disparo automático/WhatsApp Business API, programa de pontos/fidelidade, cupons, unificação de clientes com telefones diferentes, importação de contatos externos, histórico de anotações por autor, relatórios mensais (subprojeto E).
