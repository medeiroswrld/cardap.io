# Critérios de aceite e piloto

## Pronto para testar com clientes reais

- Um restaurante configura categorias próprias e publica produto com preço e foto/vídeo.
- Cliente abre QR/NFC, navega sem cadastro, alterna categorias e adiciona à sacola.
- Nome/WhatsApp/mesa são pedidos apenas ao finalizar; publicidade é escolha separada.
- Envio cria pedido persistido uma única vez, inclusive após retry e clique duplo.
- Equipe recebe e atualiza status; cliente acompanha somente seus pedidos.
- Disponibilidade, preço atual, horário e mesa são revalidados pelo servidor.
- Nenhum restaurante lê/edita pedidos, contatos ou métricas de outro.
- Operação acessa pedidos; CRM e configurações sensíveis ficam restritos ao dono.
- Vídeo fora da tela/aba oculta não toca nem acumula tempo assistido.
- Métricas novas mostram vazio; versão do vídeo, período e amostra ficam identificados.
- Rede lenta mantém cardápio utilizável; falha de envio não mostra confirmação falsa.
- Fotos, vídeos e dados têm configuração de armazenamento, conservação e recuperação definida.
- Layout é verificado em celular e tablet/computador, com foco e contraste legíveis.
- Ambiente conectado não apresenta fixtures como dados reais.

## Coisas que faltavam na ideia inicial

Disponibilidade de itens, horários/pausa de pedidos, cancelamento com motivo, observações, manutenção de preço, recuperação de senha, papéis da equipe, privacidade/descadastro, reenvio sem duplicar pedido, processamento de vídeo, fallback de foto, validade da mesa e comportamento quando a internet cai. Esses pontos entram no plano para o piloto funcionar na operação.

Complementos pagos, combos e tamanhos precisam de regras de seleção e preço. Se o primeiro restaurante depender deles para vender, promover esse recurso para a etapa de pedidos antes do piloto; caso contrário, começar com produtos completos. Informação de ingredientes e alergênicos deve ser fornecida e revisada pelo estabelecimento.

## Teste comercial recomendado

Começar com o restaurante do amigo, dez produtos e três categorias. Treinar alguém da operação e acompanhar um período real de atendimento, mantendo alternativa de atendimento quando a conexão falhar. Depois testar em mais dois estabelecimentos com rotinas diferentes.

Registrar: tempo para publicar/atualizar produto, pedidos corretos versus erros, uso do vídeo versus lista, tempo para a equipe reconhecer pedido, custo de mídia por restaurante, suporte necessário e disposição real de pagar/renovar. Comparar com o processo anterior; tempo de vídeo isolado não comprova ganho comercial.

Definir com o dono metas práticas antes do teste: nenhum pedido perdido/duplicado, preço correto, equipe consegue operar e atualização de cardápio é viável. Avançar após uso real e aceitação de uma mensalidade explícita; rever o escopo se depender de muito serviço manual ou equipe não incorporar o painel.

## Implementação opcional de R$ 400

Hipótese de pacote inicial: configuração de um restaurante, até dez produtos/três categorias, links de mesas, tratamento básico de materiais enviados e treinamento curto com checklist de gravação. Validar horas e custos antes de prometer esse preço. Gravação presencial, deslocamento, edição avançada, tags NFC físicas e novos lotes de produtos têm orçamento separado.

Orientação mínima para publicar precisa estar incluída no produto. Um minicurso mais completo pode ser adicional, mas o cliente deve conseguir usar a assinatura sem comprá-lo. No MVP, vender esse serviço manualmente; o checkout automático de adicionais vem depois.
