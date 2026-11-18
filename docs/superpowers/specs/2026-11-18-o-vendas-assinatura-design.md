# O — Página de vendas, assinatura (Asaas) e planos

Data: 18/11/2026 · Aprovado pelo usuário no chat · Branch: `melhorias/piloto` · Migration: `021_billing.sql`

## Objetivo
Vender o Fome Play sozinho: página de vendas em `fomeplay.com.br`, assinatura com pagamento no Asaas, liberação automática do plano, recursos por plano com cadeado e bloqueio por atraso.

## Planos (fechados pelo usuário)
| Plano | Mensal | Anual (paga 10, leva 12) | Venda |
|---|---|---|---|
| Essencial | R$ 149 | R$ 1.490 | sozinho |
| Profissional | R$ 249 | R$ 2.490 | sozinho |
| Agência Amply | R$ 597 | — | WhatsApp do dono (serviço) |
- Implantação R$ 297, cobrada uma vez junto com o 1º pagamento (Agência: grátis, fora do fluxo automático).
- **Fundador:** os 10 primeiros assinantes do Profissional **mensal** pagam R$ 179/mês para sempre. A página mostra "Restam N de 10" (N = 10 − fundadores com status pendente, ativo ou atrasado). Esgotado: some da página e o Profissional volta a R$ 249.
- Garantia de 30 dias: texto na página; o reembolso é feito pelo dono no painel do Asaas (o webhook de estorno cancela o plano).

## Recursos por plano
- **Essencial:** Visão geral, Pedidos, Cardápio (produtos, opcionais, categorias, QR), Configurações (incl. impressão, Pix manual, horários, entrega), identidade **básica** (logo, capa e cor principal).
- **Profissional e Agência:** tudo + Clientes (CRM, Avaliações, Cupons, Reconquistar), Relatórios (Resultados, Métricas, Origem), Financeiro, upsell/combos na sacola e identidade **completa** (temas, cores, fontes, cantos).
- No Essencial, os itens do Profissional aparecem na barra e nas abas com cadeado; abrir mostra um cartão "Disponível no Profissional" com o que o recurso faz e o botão **"Liberar no Profissional"** (vai para Plano e pagamento).
- O bloqueio vale no servidor: rotas e ações do Profissional respondem `PLAN_REQUIRED` (403) para restaurantes no Essencial; cupom em restaurante Essencial é ignorado no pedido (`COUPON_INVALID` no preview).
- Restaurantes que já existem (Capiburguer e testes) entram como Profissional **cortesia**, sem cobrança, até o dono mudar manualmente no banco.

## Página de vendas (`/`)
Curta e visual (preferência do usuário: pouco texto, headline curta, no máximo 2 blocos por assunto), no design system K (claro e escuro, vermelho Fome Play, Poppins). Seções:
1. Topo: logo, "Entrar" (→ `/login`, ou `/gestao` se já logado) e "Ver demonstração" (→ `/r/demo`).
2. Chamada: "O cardápio que traz seu cliente de volta." + subtítulo curto (sem comissão, cardápio em vídeo, reconquista e financeiro) + botões "Ver planos" e "Ver demonstração"; imagem/mock do cardápio em reels.
3. Diferenciais (4 cartões curtos): Cardápio em vídeo · Sem comissão por pedido · Traz o cliente de volta (cupons e reconquistar) · Financeiro e resultados em reais.
4. Calculadora: "Quanto você vende por mês no iFood?" (R$) + comissão (padrão 27%, ajustável 12–30%) → "Pedindo direto, você economiza até R$ X por mês" (= vendas × comissão).
5. Planos: mensal/anual (seletor), 3 cartões, Profissional em destaque ("Mais escolhido"), fundador quando houver vaga ("Fundador: R$ 179/mês para sempre · restam N de 10"), implantação R$ 297 informada abaixo; botões "Assinar" (Essencial/Profissional → `/assinar?plano=...&ciclo=...`) e "Falar com a gente" (Agência → WhatsApp do dono com texto pronto).
6. Garantia de 30 dias.
7. Perguntas (5–6, em acordeão): Tem comissão? Preciso de máquina/app? Como recebo os pedidos? Posso cancelar? O que é a implantação? Funciona com meu iFood?
8. Rodapé: Amply, Privacidade, WhatsApp.
- SEO: título "Fome Play — cardápio digital que traz seu cliente de volta", descrição, Open Graph, indexável (a página raiz deixa de redirecionar); `robots`/`sitemap` incluem `/`.
- O número de WhatsApp do dono vem de variável de ambiente pública `NEXT_PUBLIC_SALES_WHATSAPP`.

## Assinar (`/assinar`)
- Formulário: plano (Essencial/Profissional) e ciclo (mensal/anual) pré-selecionados pela URL e editáveis; nome do restaurante; seu nome; e-mail; WhatsApp; CPF ou CNPJ (validado); senha (mín. 8) ; aceite dos termos/privacidade. Resumo à direita: plano, valor, implantação R$ 297, total do 1º pagamento.
- Ao enviar (rota de servidor, rate-limited por IP):
  1. cria o usuário no Supabase Auth (serviço) e o restaurante (mesma rotina do cadastro atual) com o usuário como dono;
  2. cria `restaurant_billing` com status `pendente` (e `founder = true` se Profissional mensal com vaga);
  3. no Asaas: cria o cliente (nome, CPF/CNPJ, e-mail, celular, `externalReference = restaurant_id`), uma cobrança avulsa "Implantação + 1º período" (valor = implantação + 1º mês ou 1º ano; `billingType = UNDEFINED`; vencimento hoje + 2 dias) e a assinatura (`cycle` MONTHLY/YEARLY, `nextDueDate` = hoje + 1 mês ou + 1 ano, mesmo `billingType`);
  4. faz login do usuário e redireciona para a página de pagamento do Asaas (`invoiceUrl` da cobrança avulsa).
- E-mail já usado: "Este e-mail já tem conta. Entre para continuar." (link para login). Falha no Asaas: a conta fica criada com status `pendente` e a gestão mostra a tela de pagamento com "Tentar gerar o pagamento de novo".

## Webhook (`/api/billing/asaas`)
- Autenticado pelo cabeçalho `asaas-access-token` igual a `ASAAS_WEBHOOK_TOKEN`; idempotente pelo id do evento (tabela `billing_events`).
- `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED`: status `ativo`, `overdue_since = null`, `current_period_end` = vencimento + 1 ciclo; na primeira ativação, avisa o dono do Fome Play (e-mail via Resend para `BILLING_NOTIFY_EMAIL`) "Novo assinante: <restaurante> (<plano>) — fazer implantação".
- `PAYMENT_OVERDUE`: status `atrasado`, `overdue_since` = data do vencimento (se ainda não setado).
- `PAYMENT_REFUNDED`, `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED`: status `cancelado` (cancela a assinatura no Asaas se ainda ativa).
- Eventos de restaurante desconhecido são registrados e ignorados.

## Situação e bloqueio
- Status: `pendente` (criou e não pagou) · `ativo` · `atrasado` · `bloqueado` (calculado: atrasado há mais de 7 dias) · `cancelado` · `cortesia`.
- Gestão: `pendente`, `bloqueado` e `cancelado` mostram só a tela **Plano e pagamento** (com o link da fatura em aberto); `atrasado` (até 7 dias) mostra uma faixa "Pagamento pendente desde dd/mm — regularize para não pausar os pedidos" com o link.
- Pedidos: com status `pendente`, `bloqueado` ou `cancelado`, o cardápio continua no ar mas os pedidos ficam pausados (mesma mensagem de "Pedidos pausados"; erro `CLOSED` no pedido).

## Plano e pagamento (Configurações › nova aba)
- Plano atual, ciclo, valor, situação (pill), próxima cobrança, "Fundador" quando for o caso.
- Faturas: lista das cobranças do Asaas (data, valor, situação, link "Pagar" ou "Ver comprovante").
- **Trocar de plano:** Essencial ↔ Profissional e mensal ↔ anual. Upgrade vale na hora e a assinatura é atualizada no Asaas para a próxima cobrança (sem cobrança proporcional nesta versão). Downgrade passa a valer na próxima cobrança. Fundador que muda de plano ou ciclo perde o preço de fundador (confirmação explícita).
- **Cancelar assinatura:** confirmação; cancela no Asaas; acesso segue até `current_period_end`, depois status `cancelado`.

## Dados (migration 021)
- `restaurant_billing(restaurant_id pk, plan 'essencial'|'profissional'|'agencia', cycle 'mensal'|'anual', status, founder bool, price_cents, asaas_customer_id, asaas_subscription_id, setup_payment_id, current_period_end date, overdue_since date, pending_plan, pending_cycle, created_at, updated_at)`: leitura só do dono (RLS), escrita só pelo servidor (service role) e por funções.
- `billing_events(id text pk, restaurant_id, type, payload jsonb, received_at)`: só service role.
- `restaurant_plan(p_restaurant) returns text` (plano efetivo: `essencial` | `profissional`, considerando status) e `restaurant_billing_state(p_restaurant) returns text` (status efetivo com o cálculo de `bloqueado`), usadas pelo servidor e por funções do banco.
- `founder_slots_left() returns int` pública (só o número).
- Restaurantes existentes: insert de `cortesia` + `profissional`.

## Variáveis de ambiente (o dono cadastra na Vercel)
`ASAAS_API_KEY`, `ASAAS_ENV` (`sandbox` | `production`), `ASAAS_WEBHOOK_TOKEN`, `BILLING_NOTIFY_EMAIL`, `NEXT_PUBLIC_SALES_WHATSAPP`. Nunca no código nem no chat.

## Fora de escopo
Cobrança proporcional em upgrade, cupom de desconto na assinatura, notas fiscais da assinatura, plano Agência pelo site, programa de afiliados.

## Testes
Banco: plano efetivo por status, cálculo de bloqueado (7 dias), vagas de fundador, permissões. Unitário: preços por plano/ciclo/fundador, validação de CPF/CNPJ, calculadora, mapeamento de eventos do webhook para status, mapa de recursos por plano. Integração com Asaas: cliente HTTP com testes usando respostas simuladas; teste manual no sandbox ponta a ponta antes de publicar. Visual: página de vendas (celular e computador, claro e escuro), `/assinar`, cadeados e telas de bloqueio.
