# Telas e direção visual

Dois ambientes por restaurante; várias telas dentro de cada ambiente.

## Cliente

| Tela | Conteúdo e comportamento |
| --- | --- |
| Cardápio `/r/[slug]` | Cabeçalho compacto com restaurante, mesa e sacola. Um produto por painel vertical. Vídeo, nome, descrição curta, preço e botão Adicionar. Categorias na barra horizontal inferior, acima da área segura do celular. Busca e alternância para lista. |
| Produto — painel sobreposto | Ingredientes, descrição completa, quantidade, observação e disponibilidade. Se o item acabou, informar e impedir inclusão. |
| Sacola | Itens editáveis, quantidades, observações, subtotal e total. Estado vazio com retorno ao cardápio. Sacolas separadas por restaurante. |
| Identificação e confirmação | Nome, WhatsApp com DDD e mesa. Resumo do pedido. Autorização opcional e desmarcada para promoções do restaurante. Botão Enviar pedido. |
| Acompanhamento `/r/[slug]/pedido/[id]` | Número do pedido, mesa, itens, status, horário e estimativa informada pela equipe. Recebido significa aguardando início do atendimento. Cancelamento mostra motivo e orientação de contato. |
| Cadastro opcional de contato | Pode ser acessado sem fazer pedido, pelo item Receber novidades. Nome e telefone não viram uma conta autenticada. Não mostrar histórico de pedidos apenas por digitar um número. |

Categorias padrão sugeridas: Lanches, Porções, Bebidas e Sobremesas. O dono pode renomear, adicionar, ordenar ou ocultar. Categoria sem produto publicado não aparece. Ao trocar, mostrar o primeiro produto daquela categoria. A barra deve rolar horizontalmente e manter a categoria selecionada visível.

Fluxo principal: QR/NFC → cardápio → produto → sacola → nome/WhatsApp/mesa → envio confirmado → acompanhamento. O cadastro não interrompe a descoberta.

## Estabelecimento

| Tela | Conteúdo e comportamento |
| --- | --- |
| Cadastro/login | Conta do dono por e-mail e senha, recuperação de acesso e confirmação do e-mail. Nome comercial e WhatsApp do estabelecimento no onboarding. Login por WhatsApp depende de provedor/verificação e fica para depois. |
| Primeira configuração | Nome/logo, endereço, horários, mesas e categorias iniciais. Checklist para publicar o primeiro produto e testar um pedido. |
| Visão geral | Pedidos em aberto, itens mais pedidos e resumo de atenção, com período e volume da amostra. Sem gráfico fictício em estabelecimento novo. |
| Pedidos | Colunas Recebidos, Em preparo, Prontos e Entregues; cancelados em filtro. Mesa, tempo transcorrido, itens e ação explícita para próxima etapa. Atualização automática e aviso de conexão. |
| Detalhe do pedido | Itens, observações, dados de atendimento, histórico de status, estimativa manual e cancelamento com motivo. Não depender só de arrastar cartões. |
| Produtos | Lista, busca, categoria, preço, status de publicação e disponibilidade. Duplicar, editar, pausar e arquivar. |
| Editor de produto | Nome, descrição/ingredientes, preço, categoria, foto, vídeo, posição e publicação. Upload com progresso e processamento; foto substitui vídeo indisponível. Prévia móvel. |
| Categorias | Modelos iniciais, criar categoria própria, renomear, reordenar e ocultar. Ao remover categoria com produtos, pedir realocação. |
| Métricas | Visualizações qualificadas, segundos assistidos, conclusão, inclusões na sacola e produtos pedidos. Filtros por período/produto/versão do vídeo. Explicar cada indicador. |
| Contatos — mini CRM | Nome, telefone, primeira/última interação, pedidos vinculados à sessão, origem e autorização de marketing. Busca e filtro de consentimento. Número informado não significa identidade verificada. |
| Configurações | Perfil, horários, aceitar/pausar pedidos, mesas e links QR/NFC, equipe e permissões, privacidade e contato de suporte. |

Layout da gestão: menu lateral no computador, navegação compacta no tablet/celular. Priorizar Pedidos durante operação. Cozinha não precisa ver o CRM completo.

## Direção visual a implementar

Referência 1: categorias personalizáveis e identidade do restaurante. Referência 2: comida em tela grande e confirmação clara de pedido. Referência 3: vermelho fechado, creme e fotografia de comida. Referência 4: hierarquia de preços, categorias e sacola. Criar identidade própria, sem reproduzir marcas ou logotipos das referências.

| Token | Valor inicial | Uso |
| --- | --- | --- |
| Marca | `#A63232` | Botões e categoria ativa |
| Marca pressionada | `#852626` | Interação |
| Fundo | `#FFF8F2` | Ambiente do cliente |
| Superfície | `#FFFFFF` | Formulários, sacola e gestão |
| Texto | `#251C1A` | Leitura principal |
| Texto secundário | `#6F605B` | Apoio, sujeito à verificação de contraste |
| Borda | `#E9DED6` | Separação discreta |

Fonte sugerida: Manrope, hospedada pelo projeto; preços com números tabulares. Títulos com peso 700, textos 400–500. Espaçamentos de 4/8/12/16/24/32 px. Cantos 12–20 px nos componentes, sem transformar todas as áreas em cartões arredondados. No vídeo, gradiente escuro restrito à legibilidade do texto. Não justificar a cor com promessa científica de aumentar fome.

Desenho do feed móvel:

```text
┌──────────────────────────┐
│ Restaurante   Mesa 04  🛍 │
│ Buscar           Lista   │
│                          │
│       VÍDEO DO PRATO     │
│                          │
│ Pausar / som             │
│ Smash da casa            │
│ Pão, queijo, carne...    │
│ R$ 32,90    [Adicionar]  │
│ Lanches  Porções Bebidas │
└──────────────────────────┘
```

Animação: feedback de toque de 100–160 ms; painel de produto/sacola de aproximadamente 220 ms; atualização de pedidos imediata. Usar rolagem nativa com CSS scroll-snap para o feed. Sem animação decorativa repetida na cozinha. Pausar vídeos fora da tela e com página oculta; apenas um vídeo ativo. Com movimento reduzido, oferecer reprodução manual e navegação sem movimentos extras.

## Estados indispensáveis
Cardápio sem produtos, categoria vazia, restaurante fechado, pedidos pausados, item indisponível, vídeo processando, upload falhou, conexão caiu, envio pendente, preço mudou, pedido cancelado e sessão expirada. Mensagens curtas com próximo passo. Nenhum erro deve apagar a sacola ou aparentar sucesso sem confirmação.
