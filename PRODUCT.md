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

## Curtidas, comentários e convite para o Google
No cardápio conectado, qualquer visitante pode consultar as curtidas e os comentários públicos de um prato publicado. Os controles Curtir e Comentar abrem o painel de interações. Qualquer visitante pode curtir e comentar antes de pedir: a sessão anônima é criada automaticamente, sem cadastro. A curtida é salva com um toque no coração do Reels ou do painel; o comentário tem envio explícito. O acompanhamento do pedido entregue também oferece acesso às avaliações dos itens comprados. A regra vale para pratos com foto ou vídeo e é validada no servidor.

O acesso usa o cookie de visitante do mesmo navegador, válido por até 12 horas desde a criação da sessão. Há uma curtida e um comentário por sessão e produto, mesmo que o cliente faça mais de um pedido. O comentário é opcional e aceita até 1.000 caracteres. O cliente pode editar ou remover a avaliação enquanto a sessão estiver válida; outro navegador ou uma sessão expirada não recupera esse acesso pelo telefone. Após esse prazo, a página de privacidade orienta procurar o restaurante. Remover limpa a curtida e o comentário públicos; o registro técnico permanece no banco.

Comentários aparecem sem nome ou telefone do cliente, com identificação de Visitante; a indicação de pedido entregue só aparece quando o servidor confirma a compra do prato na mesma sessão. O formulário orienta não escrever dados pessoais no texto. O painel público apresenta os totais e até 20 comentários mais recentes. Na gestão, somente o dono acessa a aba Avaliações, com até 200 avaliações mais recentes; os contadores dessa aba correspondem à amostra exibida e não incluem o Google.

Em Gestão → Avaliações, o dono pode desligar curtidas e comentários para ocultar os controles e o conteúdo público, preservando o histórico. Pode também ocultar/restaurar comentários específicos; a curtida permanece, e editar um comentário ocultado não o republica. Os controles são aplicados no servidor e isolados por restaurante.

Cada restaurante pode configurar, em Configurações, um link opcional de avaliação do Perfil da Empresa no Google. O usuário ainda não forneceu esse link e pretende cadastrá-lo depois; vazio, ele mantém o convite oculto. Quando configurado, o convite aparece após a entrega, independentemente de curtida, comentário ou opinião positiva/negativa. O link abre outra aba, onde o cliente escreve e publica manualmente com sua conta Google. Não há publicação automática, cópia de comentários, sincronização ou importação de avaliações do Google.

Evidência da versão inicial com compra obrigatória (19/10/2026): 41 testes SQL aprovados; build com Webpack e lint aprovados; percurso Playwright na aplicação compilada local, conectado ao Supabase hospedado, aprovado com dados isolados removidos após o teste. A revisão independente das oito capturas retornou `ship` no escopo desta funcionalidade, sem correções materiais. O launcher/detector apresentou `cache_directory_failed`; a revisão visual e a documentação foram feitas a partir dos arquivos e capturas. Esses resultados não constituem aprovação geral de produção.

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
