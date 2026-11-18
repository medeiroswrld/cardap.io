# M — Cupons, Reconquistar clientes e Origem do pedido

Data: 18/11/2026 · Aprovado pelo usuário no chat · Branch: `melhorias/piloto` · Migration: `019_coupons_origins.sql`

## Objetivo
Dar ao lojista três ferramentas para vender mais direto: cupom de desconto, uma lista de quem sumiu (30/60/90 dias) com WhatsApp pronto e o cupom no link, e saber de onde vêm os pedidos.

## 1. Cupons (Clientes › aba "Cupons")
- **Campos:** código (3–20 caracteres, letras e números, gravado em maiúsculas, único por restaurante), tipo `percent` (1–90) ou `fixed` (R$ 0,01–R$ 500,00), validade opcional (data, inclusive, no fuso do restaurante), pedido mínimo opcional (em centavos, sobre os itens, sem taxa de entrega), ativo (sim/não).
- **Gestão:** listar, criar, editar, pausar/ativar e apagar. Apagar um cupom já usado é bloqueado (pausar resolve); o código não pode ser trocado depois de usado. Cada cupom mostra quantas vezes foi usado (pedidos não cancelados/recusados) e o desconto total dado.
- **Link do cupom:** `https://fomeplay.com.br/r/<slug>?cupom=<CODIGO>`, com botão "Copiar link".
- **No cardápio:** na finalização, um campo "Cupom" com botão "Aplicar". Abrir o cardápio com `?cupom=` guarda o código (sessionStorage) e o aplica sozinho na finalização. Ao aplicar, o cardápio consulta o cupom (função pública de validação) e mostra "Desconto (CÓDIGO) −R$ X" no resumo; erro em texto: "Cupom não encontrado.", "Este cupom expirou.", "Este cupom vale para pedidos a partir de R$ X." O cliente pode remover o cupom.
- **Regra do desconto:** sobre a soma dos itens (sem taxa). `percent` = arredondado para baixo em centavos; `fixed` = no máximo a soma dos itens. Total = itens − desconto + taxa de entrega. Vale para mesa, retirada e entrega.
- **Segurança:** `place_guest_order` recebe `coupon_code` e `expected_discount_cents`, revalida tudo (existe, ativo, validade, mínimo) e recalcula; se o desconto mudou, `PRICE_CHANGED` (o cliente confirma de novo, como já acontece com preço e taxa). Erros novos: `COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_MIN_ORDER`, com mensagens em português na API.
- **Onde aparece:** pedido grava `coupon_code` e `discount_cents`. O desconto aparece no cartão do pedido na gestão, no cupom impresso, no acompanhamento do cliente e no WhatsApp de confirmação, se houver.

## 2. Reconquistar clientes (Clientes › aba "Reconquistar")
- Filtro em pílulas: **30**, **60**, **90 dias** (padrão 30) = clientes cujo último pedido não cancelado foi há pelo menos N dias.
- Só clientes com marketing autorizado (regra LGPD que já vale para a campanha).
- Cada linha: nome, telefone, data do último pedido, nº de pedidos, total gasto, e botão **"Chamar no WhatsApp"** que abre `https://wa.me/55<telefone>?text=<mensagem>`.
- Acima da lista: seletor "Cupom para enviar" (cupons ativos e não vencidos, ou "Sem cupom") e a mensagem editável, padrão: "Oi {nome}! Faz tempo que você não pede no {restaurante}. Preparamos um desconto pra você voltar: {link}" (sem cupom: link do cardápio). `{nome}` = primeiro nome.
- Lista paginada (50 por página), ordenada pelo último pedido mais antigo primeiro. Só o dono vê.

## 3. Origem do pedido (Relatórios › aba "Origem")
- **Origens:** `mesa` (automática: todo pedido de mesa), `ifood` ("Embalagem do iFood"), `instagram` ("Instagram") e origens livres criadas pelo dono (nome até 40 caracteres; slug gerado, até 20 origens). Pedidos sem origem = "Direto".
- **Links:** cada origem (menos mesa) tem link `https://fomeplay.com.br/r/<slug>?origem=<slug-da-origem>` e QR em PNG para baixar (mesma biblioteca `qrcode` do QR das mesas). A origem chega pela URL, fica no sessionStorage e vai no pedido; uma origem desconhecida é ignorada (pedido fica "Direto").
- **Relatório do mês** (seletor de mês igual ao de Resultados): por origem, pedidos entregues e total vendido, ordenado por total.
- Origens livres podem ser apagadas; os pedidos já feitos mantêm o slug e aparecem com o nome "Origem apagada".

## Dados (migration 019)
- `coupons(id, restaurant_id, code, kind, value, min_order_cents, valid_until date, active, created_at)` com `unique(restaurant_id, code)`, RLS de leitura para membros e escrita só por funções `security definer` com `is_member(..., true)`.
- `order_origins(id, restaurant_id, slug, name, created_at)` com `unique(restaurant_id, slug)`, mesma política.
- `orders` ganha `coupon_code text`, `discount_cents integer not null default 0 check (>=0)`, `origin text`.
- Funções: `save_coupon`, `delete_coupon`, `check_coupon` (pública, para o cardápio: devolve tipo/valor/mínimo/validade ou erro), `save_origin`, `delete_origin`, `lapsed_customers(p_restaurant, p_days, p_offset)`, `origin_report(p_restaurant, p_month)`, e a nova `place_guest_order`.

## Fora de escopo
Cupom de frete grátis ou item grátis, limite de usos, 1 uso por cliente, envio automático de WhatsApp (API), atribuição por UTM do Google/Meta.

## Testes
Banco (PGlite): cálculo de desconto %/R$, mínimo, validade, cupom pausado, `PRICE_CHANGED` quando o desconto muda, idempotência, origem válida/ inválida, relatórios, permissões (staff e anônimo não editam). Unitário: cálculo do desconto no cliente igual ao do banco, montagem de link e mensagem. Visual: finalização com cupom, abas novas na gestão nos dois modos.
