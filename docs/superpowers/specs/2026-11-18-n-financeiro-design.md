# N — Gestão financeira

Data: 18/11/2026 · Aprovado pelo usuário no chat · Branch: `melhorias/piloto` · Migration: `020_finance.sql` (depois da 019 da peça M)

## Objetivo
O dono enxerga quanto entrou, quanto gastou e quanto sobrou, sem planilha: caixa do dia, resultado do mês com despesas, contas a pagar e o desconto da maquininha. Só o dono vê.

## Navegação
Nova seção **Financeiro** na barra lateral (ícone `Wallet`), entre Relatórios e Configurações, com as abas **Caixa do dia**, **Resultado do mês** e **Contas a pagar** (chaves `caixa`, `mes`, `contas` em `src/lib/admin-sections.ts`). Só aparece para o dono.

## 1. Caixa do dia
- Seletor de dia (padrão: hoje no fuso do restaurante; até 90 dias para trás).
- **Vendas do Fome Play** do dia = pedidos `entregue` criados no dia (fuso do restaurante), agrupados por forma: Dinheiro, Cartão, Pix e "Mesa (pago no local)" (pedidos de mesa não têm forma registrada). Para cada uma: nº de pedidos e total.
- Linhas: Itens (subtotal), Taxas de entrega, Descontos de cupom (−), **Total vendido**; Taxa da maquininha estimada (−, cartão × % cartão + Pix × % Pix); **Outras receitas** do dia (lançadas à mão, ex.: "iFood", "Balcão"); **Líquido do dia** = total vendido − taxa da maquininha + outras receitas.
- Lançar outra receita: descrição (2–60), valor (R$ 0,01–R$ 100.000), dia; listar e apagar as do dia.
- Botão **"Copiar resumo"**: texto simples para WhatsApp, ex.: "Caixa 18/11 — Dinheiro R$ 320,00 · Cartão R$ 1.240,00 · Pix R$ 410,00 · Mesa R$ 180,00 · Outras R$ 600,00 · Líquido R$ 2.712,40".

## 2. Resultado do mês
- Seletor de mês (igual a Resultados).
- **Receitas:** vendas do Fome Play (pedidos entregues) + outras receitas do mês.
- **Taxa da maquininha:** estimada como no caixa.
- **Despesas** do mês por categoria (pela data de competência da despesa), com total por categoria e lista (data, descrição, categoria, valor, pago/a pagar; editar e apagar).
- **Lucro** = receitas − taxa da maquininha − despesas; em verde se ≥ 0, vermelho se < 0. Comparação com o mês anterior ("+12%").
- **Nova despesa:** descrição (2–80), categoria, valor (R$ 0,01–R$ 1.000.000), data de competência, e "Já paga?" — se não, data de vencimento (obrigatória).
- Categorias fixas: Insumos, Embalagens, Funcionários, Aluguel, Contas (luz, água, gás, internet), Marketing, Impostos, Outros.

## 3. Contas a pagar
- Despesas não pagas, ordenadas por vencimento: vencidas (vermelho, "Venceu há N dias"), vencendo nos próximos 7 dias (destaque, "Vence em N dias"/"Vence hoje"), depois as demais.
- Botão **"Marcar como pago"** (grava a data do pagamento; pode desfazer em "Pagas recentemente", últimos 30 dias).
- **Visão geral:** aviso "N contas vencem esta semana" (inclui vencidas) com link para a aba, só para o dono e só se N > 0.

## Taxas da maquininha (Configurações)
- Campos "Taxa do cartão (%)" e "Taxa do Pix (%)", 0–15 com 2 casas, padrão 0. Usadas só para estimar; não mudam pedidos.

## Dados (migration 020)
- `restaurants`: `card_fee_percent numeric(4,2) not null default 0 check 0–15`, `pix_fee_percent` igual.
- `finance_entries(id, restaurant_id, kind 'expense'|'income', description, category (só para expense; null para income), amount_cents, entry_date date, due_date date null, paid_at date null, created_at)`; checks: expense a pagar exige `due_date`; income é sempre paga (`paid_at = entry_date`).
- RLS: leitura só para dono (`is_member(restaurant_id, true)`); escrita só por funções `security definer`: `save_finance_entry`, `delete_finance_entry`, `set_entry_paid(p_restaurant, p_id, p_paid boolean)`, `save_payment_fees`.
- Relatórios: `cash_day(p_restaurant, p_day date)` e `finance_month(p_restaurant, p_month date)` devolvem jsonb prontos; `bills_due(p_restaurant)` devolve as contas abertas e as pagas nos últimos 30 dias. Valores em centavos; taxa estimada arredondada para baixo.

## Fora de escopo
Conciliação bancária, emissão de nota, integração com maquininha ou iFood, despesas recorrentes automáticas, múltiplos caixas/turnos, exportar planilha (pode vir depois).

## Testes
Banco: somas do caixa por forma de pagamento e fuso, taxa estimada, outras receitas, lucro do mês e mês anterior, contas vencidas/semana, marcar pago/desfazer, validações e permissões (staff e anônimo bloqueados). Unitário: texto do "Copiar resumo", rótulos de vencimento. Visual: as 3 abas nos dois modos.
