<!-- impeccable:product-schema 1 -->
# Produto: cardápio em vídeo com pedidos na mesa

## Propósito e estágio
Aplicativo web para descobrir pratos em vídeos curtos, pedir da mesa e acompanhar o preparo. O restaurante publica o cardápio, recebe pedidos e acompanha atenção por produto e contatos. Nome provisório: Cardápio Reels; identidade e marca definitivas ainda não escolhidas.

Ideia em validação. Nenhum resultado do painel de compradores fictícios equivale a demanda real. Primeiro piloto recomendado: restaurante do amigo, seguido de mais dois estabelecimentos. Preço de assinatura ainda não validado.

## Platform
web

## Stack
Delegada pelo usuário, que pediu recomendação de tecnologias: Next.js App Router, TypeScript, Tailwind, componentes acessíveis shadcn/ui, Supabase e Cloudflare Stream. Proposta para concentrar interface, dados e pedidos em um projeto.

Web responsiva, prioridade para celular no cliente e tablet/computador na gestão. Implementar manifesto instalável depois do fluxo básico; acesso por navegador já atende QR e NFC.

## Usuários e contexto
- Cliente sentado à mesa, frequentemente em rede móvel ou Wi-Fi fraco. Quer ver preço, ingredientes e disponibilidade, escolher rapidamente e saber se o pedido foi recebido.
- Dono: publica produtos e categorias, consulta pedidos, contatos e métricas.
- Atendente/cozinha: atualiza andamento; acesso apenas às informações necessárias para atender.
- Agência: possível canal de implementação e vídeos; painel próprio fica para outra versão.

## Escopo confirmado pelo usuário
- Navegação livre, sem cadastro obrigatório para ver o cardápio.
- Produtos por deslize vertical; categorias em barra horizontal inferior.
- Nome e WhatsApp ao finalizar o pedido, com mesa identificada pelo link ou informada pelo cliente.
- Sacola e pedido persistido no painel do estabelecimento.
- Recebido → em preparo → pronto → entregue; cancelamento com motivo como exceção operacional.
- Cadastro e publicação de produtos, vídeos/fotos e categorias personalizadas.
- Ingredientes removíveis definidos por produto, incluídos por padrão; o cliente desmarca o que deseja retirar, sem desconto no preço.
- Adicionais opcionais escolhidos por checkbox, uma vez por unidade do produto, com preço adicional individual (inclusive gratuito). A aba Opcionais da gestão permite cadastrar, editar, pausar e vincular cada opcional aos produtos em que será oferecido.
- Sacola mantém separadas as combinações de ingredientes e adicionais. Sacola, finalização e pedido exibem as escolhas; pedidos recebidos preservam os nomes e preços dos adicionais e os ingredientes retirados, mesmo após alterações no cadastro.
- No fluxo conectado, o servidor valida ingredientes retirados, adicionais ativos e seus vínculos, calcula o preço por unidade e rejeita escolhas ou preços que tenham mudado antes do envio.
- Tempo assistido por vídeo e mini CRM por estabelecimento.
- Pagamento no local; pagamento online depois.
- Vermelho fechado, fundo claro e destaque para comida; personalização de cores depois.

## Posicionamento a testar
Um cardápio que facilita escolher e pedir, com vídeos que o restaurante consegue manter atualizados. Vídeo, NFC e métricas já existem no mercado; não apresentar esses recursos como exclusividade. O piloto deve testar facilidade de publicação, uso pela equipe e qualidade do pedido.

## Limites do MVP
Sem delivery, integração com PDV, cobrança automática da assinatura, campanhas automáticas de WhatsApp, previsão de preparo por IA, aplicativo nativo, painel de agência ou editor de vídeo. Adicionais simples com preço por unidade e retirada de ingredientes sem desconto fazem parte do MVP; regras complexas de complementos e combos ficam para uma segunda etapa. Observações livres continuam disponíveis sem cobrança adicional.

## Princípios
Preço e ação de pedir sempre legíveis. Dados de restaurantes separados. Métricas observadas, sem alegar causalidade sobre vendas. Pedido só aparece como enviado após persistência confirmada. Marketing é opcional e separado da identificação para atendimento.

## Acessibilidade e qualidade
Teclado e leitor de tela, foco visível, controles de pelo menos 44 × 44 px, contraste verificado, preços fora da imagem, pausa e controle de áudio, modo lista e respeito a movimento reduzido. Vídeo não deve bloquear o uso em conexão lenta.

## Evidências e decisões abertas
Referências visuais fornecidas pelo usuário; confirmação dos fluxos em 11/10/2026. Região, nome, mensalidade, volume de vídeos, orçamento de infraestrutura e regras de conservação dos dados ainda precisam ser definidos no piloto. Pacote opcional de implementação de R$ 400 é hipótese comercial, com quantidade de produtos e horas delimitada antes de vender.
