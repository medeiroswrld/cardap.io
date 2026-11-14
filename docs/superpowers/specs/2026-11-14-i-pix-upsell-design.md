# I — Pix pelo cardápio e upsell na sacola

Data: 14/11/2026 · Aprovado pelo usuário no chat · Branch: `melhorias/piloto`

Duas partes independentes, publicadas separadamente, nesta ordem:

1. **I1 — Pix manual pelo cardápio** (migration 014): o pedido com Pix só vai para a cozinha depois que o restaurante confirma o pagamento.
2. **I2 — Upsell na sacola** (migration 015): virar combo, sugestões e janela ao finalizar.

Fora do escopo: Pix automático por gateway (Mercado Pago/Asaas). O desenho deixa o ponto de troca isolado: o botão "Pix recebido" chama a mesma transição que um webhook chamaria no futuro.

---

## I1 — Pix manual

### Problema
Pedido grande pago na entrega pode ser desistido depois de preparado. Com o Pix pago antes, o restaurante só prepara o que já recebeu.

### Configuração (dono)
- Em Configurações, um bloco "Pix pelo cardápio" com: **chave Pix** (1–77 caracteres), **nome do recebedor** (1–25 caracteres, sem acento no código gerado) e **cidade** (1–15 caracteres, idem).
- Salvo numa tabela própria `restaurant_pix(restaurant_id pk, pix_key, merchant_name, merchant_city, updated_at)`, **legível só por membros** (RLS `is_member`). Não vai para `restaurants`, que é público.
- Gravação por RPC `save_restaurant_pix(p_restaurant, p_key, p_name, p_city)`, só dono (`is_member(..., true)`). Chave vazia = apaga a linha (Pix pelo cardápio desligado).
- O catálogo público recebe só um booleano `pix_online` (existe linha em `restaurant_pix`). Exposto pela função `restaurant_pix_enabled(p_restaurant) returns boolean` (security definer, `execute` para anon e authenticated), chamada pelo `fetchCatalog`. Nenhuma chave chega ao catálogo.
- WhatsApp do comprovante: campo `phone` que o restaurante já tem. Sem telefone, o botão de WhatsApp não aparece e o texto diz "envie o comprovante para o restaurante".

### Cliente
- Em retirada e entrega, se `pix_online`: a opção "Pix na hora" passa a se chamar **"Pix agora, pelo cardápio"** (`payment_method` continua `pix`). Sem `pix_online`, nada muda.
- Mesa não muda (sem forma de pagamento).
- Ao finalizar, a tela de acompanhamento, enquanto o status for `aguardando_pagamento`, mostra:
  - valor exato;
  - **QR Code** e campo **"Pix copia e cola"** com botão "Copiar";
  - botão **"Enviar comprovante no WhatsApp"** → `wa.me/55<telefone>` com o texto "Olá! Pedido #<n> no <restaurante>. Segue o comprovante do Pix de <valor>.";
  - aviso: "Seu pedido vai para a cozinha assim que o restaurante confirmar o pagamento."
- A tela já faz polling do pedido; quando vira `recebido`, mostra "Pagamento confirmado" e segue a linha do tempo normal.
- O código Pix chega na resposta da rota de acompanhamento (`GET /api/restaurants/[id]/orders/[orderId]`), que já valida o cookie do convidado e usa a service role. Só é incluído enquanto `status = 'aguardando_pagamento'`.

### Código Pix (BR Code estático)
- Função pura `src/lib/pix.ts` → `pixPayload({ key, name, city, amountCents, txid })` gerando o EMV do Pix estático: campos 00, 26 (GUI `br.gov.bcb.pix` + chave), 52 `0000`, 53 `986`, 54 valor com 2 casas, 58 `BR`, 59 nome, 60 cidade, 62 (05 = txid), 63 CRC16-CCITT (0x1021, inicial 0xFFFF).
- Nome e cidade: remover acentos, maiúsculas, cortar no limite. txid: `PED<numero>` (só A–Z0–9, até 25).
- Teste com um payload de referência conhecido (CRC conferido) e com valores com centavos.
- QR desenhado no navegador com a biblioteca `qrcode` (dependência nova, só no cliente).

### Pedido e status
- Status novo `aguardando_pagamento` (constraint `orders_status_check` recriada).
- `place_guest_order` (redefinida na 014): se `kind <> 'mesa'`, `payment = 'pix'` e existe `restaurant_pix` → `initial = 'aguardando_pagamento'`, **antes** da regra de aceite automático. Estimativa de entrega não é gravada nesse momento.
- `advance_order` (redefinida na 014), transições novas:
  - `aguardando_pagamento → recebido` (só membro; grava a estimativa do bairro se for entrega e `p_estimate` vier nulo);
  - `aguardando_pagamento → cancelado` com motivo.
- `order-flow.ts`: `nextAction('aguardando_pagamento')` = "Pix recebido" → `recebido`; `canCancel` inclui `aguardando_pagamento`; `customerSteps` de retirada/entrega começa com `aguardando_pagamento` quando o pedido nasceu nele (a linha do tempo do cliente mostra "Aguardando pagamento").
- Rota PATCH de pedido aceita `expected_status = 'aguardando_pagamento'`.

### Gestão
- Coluna **"Aguardando pagamento"** no quadro, antes de "Aguardando aceite", escondida quando vazia (mesma regra das colunas só de online).
- Card mostra valor em destaque e "há X min".
- Botões: **"Pix recebido"** (confirmação simples, sem estimativa obrigatória) e **"Cancelar pedido"** (motivo).
- Alertas: pedido novo toca como hoje; `aguardando_pagamento` **não** entra na repetição de 20 s.
- Impressão automática não muda: imprime quando o pedido aparece em `recebido`, ou seja, depois do "Pix recebido".
- Selo "Cliente novo" também vale para `aguardando_pagamento`.

### Erros e bordas
- Restaurante apaga a chave com pedidos esperando: pedidos continuam em `aguardando_pagamento`; a tela do cliente deixa de mostrar o QR e mostra "fale com o restaurante". A equipe confirma ou cancela normalmente.
- Valor do QR = `total_cents` gravado pelo servidor (nunca o do cliente).
- Cliente que não paga: fica na coluna até a equipe cancelar. Sem expiração automática.

### Testes
- Banco (PGlite, `test-online-orders.mjs`): Pix com chave nasce `aguardando_pagamento` mesmo com aceite automático; sem chave segue a regra atual; dinheiro/cartão não mudam; transições novas e proibidas; não-membro não lê `restaurant_pix`; anon não lê; só dono grava.
- Unitário: `pix.ts` (payload, CRC, acentos, limites), `order-flow`/`order-board` com o status novo.
- Live (opt-in): pedido Pix → aparece em "Aguardando pagamento" → "Pix recebido" → "Recebido".

---

## I2 — Upsell na sacola

### Virar combo
- Coluna `product_options.offer_in_bag boolean not null default false`. Em Opcionais, caixa **"Oferecer na sacola"**. `save_product_option` redefinida na 015 para gravar o campo.
- Na sacola, para cada item cujo produto tem um opcional ativo com `offer_in_bag` que o cliente não escolheu: linha **"Transformar em combo por +R$ X?"** (usa o nome do opcional) com botão "Adicionar". O toque soma o opcional ao item (mesma lógica de escolha de opcionais que já existe; o item é recalculado e, se ficar igual a outro item da sacola, junta).
- No máximo uma oferta por item (a primeira por nome).

### Sugestões
- Coluna `restaurants.bag_suggestions uuid[] not null default '{}'`, até 3 ids, validados na gravação (produtos do próprio restaurante). Gravada pelo `save_restaurant_settings` (redefinido na 015).
- Em Configurações (ou Produtos), o dono escolhe até 3 produtos para **"Sugerir na sacola"**.
- Na sacola, bloco **"Que tal adicionar?"** com foto, nome, preço e botão "+". Some o produto que já está na sacola, não publicado, esgotado ou arquivado. Produto com ingredientes removíveis ou opcionais entra com a escolha padrão (nada removido, nenhum opcional).

### Janela ao finalizar
- Ao tocar em finalizar, se existe oferta de combo pendente ou sugestão visível, abre **uma vez por visita** (estado em memória da sessão do cardápio) a janela **"Antes de fechar…"** com as mesmas ofertas e o botão **"Não, obrigado, finalizar"**.
- Aceitar uma oferta na janela adiciona e mantém a janela aberta; "Finalizar" segue para o checkout.

### Regras gerais
- Lógica de "quais ofertas mostrar" numa função pura `src/lib/bag-upsell.ts` (entrada: sacola, produtos, opcionais, links, sugestões; saída: ofertas de combo e sugestões), com testes unitários.
- Preço continua conferido no servidor (`PRICE_CHANGED`/`OPTIONS_CHANGED`); nada novo no pedido.
- Sem métricas de conversão do upsell nesta parte.

### Testes
- Unitário: `bag-upsell.ts` (combo pendente/aceito, uma por item, sugestões filtradas, limite de 3).
- Banco: `offer_in_bag` salvo e lido por anon só em opcional ativo; `bag_suggestions` rejeita produto de outro restaurante e mais de 3.
- Navegador local: sacola mostra combo e sugestões; janela aparece uma vez.

---

## Publicação
- I1: rodar a 014 no Supabase → enviar ao `main` → configurar a chave no restaurante piloto.
- I2: rodar a 015 → enviar ao `main` → marcar o opcional de combo e as sugestões.
