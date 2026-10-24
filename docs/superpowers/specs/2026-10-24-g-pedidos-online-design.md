# Subprojeto G — Pedidos online (retirada e entrega)

Data: 24/10/2026. Branch: `melhorias/g-pedidos-online`, criada a partir de `melhorias/a-fundacao` (usa o cache do catálogo, a CSP e os metadados do subprojeto A).

Roteiro revisado e aprovado: A (fundação, pronto) → **G (pedidos online)** → H (CRM gastronômico) → C (identidade) → F (escala) → E (agência) → D (vendas). O restante do antigo B (impressão, chamar garçom, PWA, convites) é reencaixado depois do H. Esta decisão substitui o "sem delivery" dos limites do MVP em `PRODUCT.md` e `docs/CONTEXTO-PARA-CLAUDE-CODE.md`; pagamento online continua fora.

## Objetivo

Além do pedido na mesa, o cliente pode pedir pelo link do restaurante para **retirar no balcão** ou **receber em casa**, pagando na entrega/retirada. O restaurante aceita ou recusa cada pedido online, é avisado por som e notificação, e acompanha tudo no mesmo quadro.

Critérios de sucesso:

- Com retirada e entrega ligadas, `/r/<slug>` (sem `?mesa=`) permite concluir um pedido de retirada e um de entrega; `/r/<slug>?mesa=N` continua exatamente como hoje.
- Um pedido de entrega só é aceito pelo servidor com bairro ativo do próprio restaurante, endereço completo, pedido mínimo atingido e troco ≥ total; o total (itens + taxa) é calculado no servidor.
- Pedido online aparece em "Aguardando aceite", toca alerta até ser aceito ou recusado, e só vai para a cozinha depois de aceito.
- Nenhuma regressão no pedido de mesa (testes de banco e Playwright existentes continuam passando).

## Decisões do usuário (24/10/2026)

- Pagamento **na entrega/retirada**: dinheiro (com "troco para"), cartão na maquininha ou Pix na hora. Sem integração de pagamento.
- Taxa e área por **lista de bairros** cadastrada pelo dono (nome, taxa, tempo estimado, ativo). Sem mapas/geocodificação.
- Proteção contra pedido falso: **o restaurante aceita ou recusa**; botão "Confirmar no WhatsApp"; "Cliente novo" destacado. Sem código por SMS.
- Somente **"o quanto antes"**, dentro do horário de funcionamento. Sem agendamento.
- Arquitetura: **estender o pedido existente** (um tipo por pedido), não criar um sistema paralelo.

## 1. Banco de dados (migration `011_online_orders.sql`)

Nada é alterado nas migrations anteriores; a 011 adiciona e substitui funções com `create or replace`/`drop ... create`, preservando assinaturas usadas pelo app ou atualizando-as junto com o código.

**`restaurants`** — novas colunas:
- `pickup_enabled boolean not null default false`
- `delivery_enabled boolean not null default false`
- `delivery_min_order_cents integer not null default 0 check (delivery_min_order_cents between 0 and 1000000)`

`accepting_orders` (pausa geral) e `opening_hours` continuam valendo para todos os tipos.

**`delivery_zones`** (nova):
- `id uuid pk`, `restaurant_id uuid not null references restaurants on delete cascade`, `name text not null (2–80)`, `fee_cents integer not null check (fee_cents between 0 and 100000)`, `estimate_minutes integer not null check (between 5 and 240)`, `active boolean not null default true`, `position integer not null default 0`, `unique(restaurant_id, id)`, mais um índice único em `(restaurant_id, lower(name))` para não repetir bairro.
- RLS: leitura pública das zonas ativas (como `dining_tables`); dono gerencia; operação lê.

**`orders`** — novas colunas e regras:
- `fulfillment text not null default 'mesa' check (fulfillment in ('mesa','retirada','entrega'))`
- `table_id` passa a aceitar nulo, com `check ((fulfillment = 'mesa') = (table_id is not null))`.
- `delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0)`; `check (fulfillment = 'entrega' or delivery_fee_cents = 0)`.
- `payment_method text check (payment_method in ('dinheiro','cartao','pix'))`; `check ((fulfillment = 'mesa') = (payment_method is null))`.
- `change_for_cents integer` (apenas dinheiro; nulo = sem troco); `check (change_for_cents is null or (payment_method = 'dinheiro' and change_for_cents >= total_cents))`.
- `total_cents` passa a significar itens + taxa de entrega.
- Status: o `check` passa a aceitar `'aguardando_aceite'`, `'recusado'` e `'saiu_para_entrega'` além dos atuais.

**`order_addresses`** (nova, dado pessoal separado do pedido):
- `order_id uuid pk`, `restaurant_id uuid not null`, `zone_id uuid not null`, `zone_name text not null` (cópia no momento do pedido), `street text (3–150)`, `number text (1–20)`, `complement text (≤80, default '')`, `reference text (≤150, default '')`, FKs compostas para `orders(restaurant_id,id)` e `delivery_zones(restaurant_id,id)`.
- RLS: somente membros do restaurante leem (dono e operação, que precisam do endereço para entregar); nenhuma escrita direta (só pela RPC).
- O acompanhamento do cliente mostra o endereço do próprio pedido pela sessão, como já faz com os itens.

**`place_guest_order`** — recebe no payload `fulfillment` e, conforme o tipo:
- `mesa`: comportamento atual inalterado (mesa ativa do restaurante obrigatória; status inicial `recebido`).
- `retirada`: `pickup_enabled` verdadeiro; sem mesa; `payment_method` obrigatório; status inicial `aguardando_aceite`.
- `entrega`: `delivery_enabled` verdadeiro; `zone_id` ativo e do mesmo restaurante; endereço válido; subtotal ≥ `delivery_min_order_cents`; taxa = `fee_cents` da zona (copiada no pedido); `payment_method` obrigatório; `change_for_cents` ≥ total quando informado; grava `order_addresses`; status inicial `aguardando_aceite`.
- Todas as validações existentes continuam: sessão, horário, pausa, catálogo, preços/opcionais, idempotência e hash do payload (o hash passa a incluir tipo, zona, endereço e pagamento), limite por sessão.
- Erros novos com código próprio (`PICKUP_DISABLED`, `DELIVERY_DISABLED`, `INVALID_ZONE`, `INVALID_ADDRESS`, `BELOW_MINIMUM`, `INVALID_PAYMENT`, `INVALID_CHANGE`), mapeados no app para mensagens em português, e acrescentados à lista fechada de códigos de log.

**`advance_order`** — transições permitidas:
- `aguardando_aceite → recebido` (aceitar; `estimate_minutes` obrigatório) e `aguardando_aceite → recusado` (motivo ≥ 3 caracteres).
- `recebido → em_preparo → pronto` (todos os tipos).
- `pronto → entregue` para mesa e retirada (na retirada o rótulo é "Retirado").
- `pronto → saiu_para_entrega → entregue` para entrega (entrega não pula `saiu_para_entrega`).
- Cancelar (motivo ≥ 3) a partir de `recebido`, `em_preparo` e, na entrega, `saiu_para_entrega`.
- Mantém bloqueio da linha, status esperado e registro em `order_status_events`.

**`save_restaurant_settings`** — passa a gravar `pickup_enabled`, `delivery_enabled` e `delivery_min_order_cents`. Bairros têm ação própria (`save_delivery_zone`), validada no servidor.

**Limites de abuso**: reutiliza `enforcePublicLimit(…, "order")` por origem; o limite por mesa (`order_table`) só se aplica ao tipo mesa; pedidos online usam um novo escopo por sessão `order_online` (12 tentativas por janela, como a mesa).

## 2. Catálogo e cache

- `readCatalog` passa a incluir `pickup_enabled`, `delivery_enabled`, `delivery_min_order_cents` (já vêm em `restaurant`) e as zonas ativas (`delivery_zones`, ordenadas por `position`).
- A chave de cache sobe para `["catalog", "v2", slug]` (formato mudou).
- Salvar configurações e bairros invalida o catálogo pelo mecanismo do subprojeto A (`invalidateCatalog`).

## 3. Experiência do cliente

- **Com `?mesa=N`**: tudo como hoje (tipo mesa).
- **Sem `?mesa=`**: se retirada ou entrega estiver ligada, a sacola e o checkout mostram a escolha **Retirada** / **Entrega** (só as ligadas). Se nenhuma estiver ligada, mantém o comportamento atual de pedir o número da mesa. Restaurante fechado ou pausado: o checkout informa e não envia, como hoje.
- **Entrega**: seleção do bairro (mostrando taxa e tempo), rua, número, complemento, referência; aviso do pedido mínimo com o quanto falta; resumo com subtotal, taxa e total.
- **Pagamento** (retirada e entrega): dinheiro / cartão na maquininha / Pix na hora; em dinheiro, campo opcional "troco para".
- Nome e WhatsApp continuam obrigatórios; marketing continua opcional e desmarcado.
- **Acompanhamento**: estados novos com texto próprio — "Aguardando o restaurante aceitar", "Recusado: <motivo>", "Pronto para retirar", "Saiu para entrega"; o tempo estimado aparece após o aceite; a entrega mostra o endereço informado.
- O sucesso só aparece depois da persistência confirmada (regra existente).
- A demonstração (`/r/demo`) continua apenas com mesa; nenhum tipo novo é simulado nela.

## 4. Gestão

- **Configurações**: interruptores "Aceitar pedidos para retirada" e "Aceitar pedidos para entrega", pedido mínimo da entrega, e a seção **Bairros de entrega** (adicionar, editar nome/taxa/tempo, ativar/pausar, reordenar). Somente o dono altera.
- **Quadro de pedidos**:
  - Nova primeira coluna **Aguardando aceite** (apenas pedidos online).
  - Cartão mostra etiqueta do tipo (Mesa N / Retirada / Entrega · Bairro), forma de pagamento e troco; entrega mostra endereço completo.
  - **Cliente novo**: destacado quando não existe pedido anterior do mesmo telefone no restaurante com status diferente de `recusado`.
  - Ações: **Aceitar** (pede o tempo estimado), **Recusar** (pede o motivo), **Confirmar no WhatsApp** (abre `https://wa.me/55<telefone>` em nova aba com o resumo do pedido pré-preenchido; sem envio automático).
  - Entrega ganha a coluna/ação **Saiu para entrega**; retirada mostra "Retirado" na última ação.
  - Operação (atendimento/cozinha) também aceita, recusa e avança pedidos.
- **Alerta de pedido novo** (antecipado do antigo subprojeto B):
  - Som curto ao chegar qualquer pedido novo; repete a cada 20 s enquanto existir pedido em `aguardando_aceite`.
  - Título da aba alterna "(N) Novo pedido" enquanto houver pendente.
  - Notificação do navegador quando a aba está em segundo plano, após o usuário clicar em "Ativar alertas" (permissão pedida por gesto; navegadores bloqueiam som sem interação prévia).
  - Botão para silenciar, lembrado por navegador (`localStorage` com `try/catch`).
  - Detecção usa o Realtime/reconciliação de 15 s já existentes; não promete instantâneo.

## 5. Privacidade

- Endereço é dado pessoal: tabela separada, acesso só a membros do restaurante e à sessão que fez o pedido, sem envio a terceiros, sem log (lista fechada de campos da observabilidade não inclui endereço).
- Páginas de privacidade (`/privacidade` e `/r/[slug]/privacidade`) passam a mencionar endereço de entrega e sua finalidade (entregar o pedido).
- O botão do WhatsApp apenas abre uma conversa iniciada pela equipe; nada é enviado automaticamente.

## 6. Testes

- **Banco (PGlite, `npm run test:database`)**: cada ramo de `place_guest_order` (mesa inalterada; retirada; entrega válida; desligados; zona de outro restaurante; zona inativa; endereço inválido; abaixo do mínimo; troco menor que total; idempotência com payload diferente); transições de `advance_order` por tipo, incluindo proibidas; RLS de `order_addresses` (anônimo e outro restaurante não leem) e de `delivery_zones`.
- **Unitários (`node:test`)**: cálculo de subtotal/taxa/total e validação de troco no cliente; montagem da mensagem do WhatsApp; regra do alerta (repete enquanto há pendente).
- **Playwright**: regressão completa existente; teste opt-in `RUN_CONNECTED_LIVE=1` criando restaurante temporário com retirada e entrega ligadas e um bairro, fazendo pedido de entrega no navegador do cliente, aceitando na gestão, avançando até "entregue", e verificando endereço/taxa/total; limpeza de todos os dados no `finally`.

## Fora do escopo

Pix ou cartão online, agendamento, cálculo por distância/mapas, app ou rastreio do entregador, integração com iFood/marketplaces, cupons e fidelidade, impressão de pedidos, livro de endereços do cliente (vai para o H), tipos novos na demonstração.
