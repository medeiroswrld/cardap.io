# J — Relatório de resultados mensal

Data: 16/11/2026 · Aprovado pelo usuário no chat · Branch: `melhorias/piloto` · Migration: 017

## Objetivo
Mostrar ao dono, em reais, o que o Cardap.io trouxe no mês, e dar à agência um PDF pronto para mandar no WhatsApp do cliente. É o argumento de renovação do plano.

## Onde fica
- Aba nova **"Resultados"** na gestão, visível só para o dono (role `owner`), com o ícone de troféu ou gráfico.
- Seletor de mês: o mês atual (parcial, rotulado "até hoje") e os 12 meses anteriores.
- Botão **"Baixar PDF"**: chama `window.print()` com uma folha de estilo `@media print` própria (A4, retrato), com:
  - cabeçalho com o nome do restaurante, "Relatório de resultados · <mês/ano>" e "Cardap.io · Amply";
  - sem menus, botões ou barra lateral da gestão.
- Fora de escopo: envio automático, link público, e-mail, cupom e origem do pedido (esses entram com o projeto de retenção).

## Regras dos números
O mês é sempre definido no fuso do restaurante (`restaurants.timezone`), de `00:00` do dia 1 até `00:00` do dia 1 do mês seguinte. Contam apenas pedidos com `status = 'entregue'`.

1. **Pedidos pelo cardápio**
   - Quantidade e faturamento (`total_cents`) no total, e separados por `fulfillment` (mesa, retirada, entrega).
   - Ticket médio = faturamento ÷ pedidos.
   - Variação contra o mês anterior, nas mesmas regras: percentual com sinal. Sem pedidos no mês anterior, mostra "—".
2. **Economia com o iFood**
   - Base = faturamento de pedidos `retirada` + `entrega`. A taxa de entrega entra, porque no iFood a comissão incide sobre o total.
   - Economia = base × `restaurants.ifood_fee_percent` ÷ 100, arredondado para centavos.
   - Exibe a fórmula: "R$ 4.600,00 × 27% = R$ 1.242,00 que ficaram com você".
   - Pedidos de mesa não entram (nunca passariam pelo iFood).
3. **Clientes** (por `customer_phone`; telefone vazio é ignorado, porque foi apagado pela LGPD)
   - **Novos:** o primeiro pedido entregue do telefone está no mês.
   - **Que voltaram:** pediram no mês e já tinham pedido entregue antes do início do mês.
   - **Reativados:** subconjunto de "que voltaram" cujo último pedido entregue antes do mês tem 30 dias ou mais em relação ao primeiro pedido do telefone no mês.
   - **Total de clientes no mês:** telefones distintos.
4. **Pratos campeões:** top 5 por quantidade (soma de `order_items.quantity`) e top 5 por faturamento (soma de `quantity × unit_price_cents`), agrupados por `product_id`, mostrando `product_name` do item mais recente.
5. **Vídeos que mais venderam:** top 5 produtos por número de adições à sacola atribuídas a quem viu o vídeo no mês. Reusa a mesma lógica de `video_associations` (migration 004), restrita ao intervalo do mês. Também mostra visualizações qualificadas do vídeo. Sem dados, a seção diz "Ainda sem vídeos assistidos neste mês".

## Banco (migration 017)
- `alter table restaurants add column ifood_fee_percent numeric(5,2) not null default 27 check (ifood_fee_percent between 0 and 60);`
- `set_ifood_fee(p_restaurant uuid, p_percent numeric)`: só o dono (`is_member(p,true)`), valida 0–60, senão `INVALID_INPUT`.
- `results_report(p_restaurant uuid, p_month date) returns jsonb`: só o dono (senão `FORBIDDEN`). `p_month` é qualquer data do mês desejado e é normalizada para o dia 1. Retorna:
  ```json
  {"month":"2026-11-01","timezone":"America/Sao_Paulo","fee_percent":27,
   "orders":{"count":0,"revenue_cents":0,"average_cents":0,
             "by_fulfillment":{"mesa":{"count":0,"revenue_cents":0},"retirada":{...},"entrega":{...}}},
   "previous":{"count":0,"revenue_cents":0},
   "ifood":{"base_cents":0,"saved_cents":0},
   "customers":{"total":0,"new":0,"returning":0,"reactivated":0},
   "top_quantity":[{"product_id":"…","name":"…","quantity":0,"revenue_cents":0}],
   "top_revenue":[…],
   "top_videos":[{"product_id":"…","name":"…","adds":0,"qualified_views":0}]}
  ```
- `security definer`, `search_path=public`, `revoke` de public/anon, `grant execute` para authenticated.

## App
- `src/lib/results-report.ts`: tipos do JSON, `monthOptions(now, timezone)` (mês atual + 12 anteriores), `variation(current, previous)` e formatação dos textos. Funções puras com testes unitários.
- Rota `GET /api/restaurants/[id]/results?month=YYYY-MM`: `requireMember(id, true)`, valida o mês e chama a RPC, com `noStore`.
- Componente `src/components/results-report.tsx`: seções na ordem acima, cartões com números grandes e a fórmula do iFood. Estilos de impressão em `globals.css` (`.results-print`).
- Configurações: campo **"Taxa que você paga no iFood (%)"** (0–60, padrão 27) no formulário de configurações, salvo via `set_ifood_fee` na rota de catálogo (ação `settings` com `ifood_fee_percent` opcional).

## Erros
- Não-dono: a aba não aparece, e a rota responde 403.
- Mês fora do intervalo ou formato inválido: 400 com a mensagem genérica.
- Falha da RPC: mensagem "Não foi possível carregar o relatório. Tente novamente." e botão de tentar de novo.

## Testes
- Banco (PGlite, arquivo novo `scripts/test-results-db.mjs`):
  - pedidos entregues, cancelados e de outro mês, nos três tipos;
  - fuso: pedido às 23:30 do dia 31 em São Paulo conta no mês certo;
  - clientes novos, que voltaram e reativados (último pedido 45 dias antes contra 10 dias antes);
  - telefone vazio ignorado;
  - economia do iFood com taxa padrão e com taxa alterada;
  - top 5 com empate e limite;
  - vídeos a partir de visualizações e adições na sacola;
  - permissão: operações e dono de outro restaurante recebem `FORBIDDEN`;
  - `set_ifood_fee` com valor válido e inválido.
- Unitário: `monthOptions`, `variation` e textos.

## Publicação
Rodar a 017 antes de publicar o código, porque o formulário de configurações passa a enviar `ifood_fee_percent`.
