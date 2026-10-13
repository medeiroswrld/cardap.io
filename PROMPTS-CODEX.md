# Prompts para construir o MVP

Use uma pasta própria para o aplicativo. Copie para ela PRODUCT.md, TELAS-E-DESIGN.md e ARQUITETURA.md deste pacote, além das referências. Abra essa pasta como projeto no Codex. Execute o prompt inicial uma vez e depois cada etapa em ordem. As etapas definem entregas verificáveis; não são estimativas de prazo.

## Prompt inicial — contexto permanente

```text
Vamos construir o MVP descrito em PRODUCT.md, TELAS-E-DESIGN.md e ARQUITETURA.md. Leia esses arquivos, as instruções do repositório e as skills frontend-design, emil-design-eng e impeccable disponíveis. As decisões confirmadas do produto prevalecem sobre preferências genéricas de design.

O produto tem dois ambientes por restaurante: cliente com cardápio de vídeos e gestão com produtos, categorias, pedidos, métricas e contatos. Cliente navega livremente; informa nome, WhatsApp e mesa ao finalizar. Produtos deslizam na vertical e categorias ficam na barra horizontal inferior. Sacola e pedidos seguem recebido → em preparo → pronto → entregue. Pagamento no local.

Use Next.js App Router, TypeScript, Tailwind, shadcn/ui com identidade própria, Supabase e Cloudflare Stream. Respeite os contratos de segurança, métricas e idempotência do documento de arquitetura. Escolha versões estáveis compatíveis e fixe o lockfile.

Antes de cada etapa, confira o estado atual. Preserve o trabalho existente. Implemente a etapa solicitada até ficar verificável; faça as checagens adequadas e relate mudanças, resultados e dependências reais. Mantenha um CHECKPOINT.md com etapa concluída e próximos passos. Se uma credencial estiver ausente, prepare a integração e identifique exatamente o que falta, mantendo demonstração explicitamente identificada. Não apresente mock ou dados sintéticos como operação conectada.

Direção visual: vermelho #A63232, fundo #FFF8F2, texto #251C1A, Manrope e comida protagonista. Use as quatro referências como inspiração de hierarquia e navegação, com identidade própria. Cliente deve funcionar em celulares pequenos e gestão em tablet/computador. Acessibilidade, conexão lenta e estados de falha fazem parte da entrega.
```

## 1. Fundação e interface demonstrável

```text
Implemente a fundação do projeto e a primeira experiência visual navegável. Leia os documentos do MVP. Crie a estrutura Next.js, tokens de design, fonte, shell de cliente e shell de gestão. Revise um plano visual compacto contra as referências antes de codificar, seguindo frontend-design.

Entregue /r/demo com feed vertical, categorias inferiores horizontais, modo lista, busca, detalhes do produto e sacola local. Entregue /demo/gestao com navegação e telas representativas de pedidos/produtos. Use um restaurante fictício com Lanches, Porções e Bebidas, preços em reais e textos plausíveis. Indique Modo demonstração; cadastros e pedidos dessa etapa não são reais. Separe fixtures dos componentes.

Use vídeos de exemplo apenas quando houver mídia disponível/licenciada; ofereça capas de foto e reprodução manual como fallback. Não simule reprodução com animação de imagem. Apenas um vídeo pode tocar; pause fora da tela/aba oculta. A sacola deve persistir por restaurante. Priorize legibilidade do preço e botão Adicionar, evitando sobreposição com barra inferior e área segura.

Abra a aplicação e revise feed, sacola e gestão em 390 px e 1280 px, se houver ferramenta de navegador. Corrija problemas observados, verifique teclado e movimento reduzido, rode lint/typecheck/build e registre o checkpoint. Entregue instruções para abrir localmente.
```

## 2. Banco, autenticação e isolamento

```text
Implemente Supabase, migrations e login da equipe de acordo com ARQUITETURA.md. Crie as entidades do MVP, índices, constraints de tenant, políticas RLS e papéis dono/operação. Configure cliente SSR conforme documentação vigente e valide sessões no servidor. Disponibilize login, recuperação e onboarding do restaurante.

Crie seed de desenvolvimento com dois restaurantes e usuários distintos para verificar isolamento. Catálogo público só lê itens publicados; contatos, pedidos e métricas são privados. Proteja mutações no servidor e credenciais. Prepare .env.example sem segredos e instruções exatas para configuração. O modo demo continua separado e não é fallback silencioso para falha de banco.

Teste tentativas reais de leitura e escrita cruzada entre os dois restaurantes, usuário sem associação e público anônimo. Verifique também permissões de operação versus dono. Reporte os resultados e finalize o checkpoint; não considere a etapa conectada sem executar as verificações no banco configurado.
```

## 3. Catálogo publicável e vídeos

```text
Implemente cadastro/edição de produtos e categorias customizadas, com ordenação, visibilidade e disponibilidade. Preços em centavos. Fotos/logos no Storage com políticas de tenant. Salvar rascunho e Publicar são ações distintas. Após publicar, o catálogo público reflete a alteração sem intervenção técnica. Produto indisponível bloqueia nova inclusão e será revalidado no checkout.

Implemente upload direto autorizado ao Cloudflare Stream, estados de envio/processamento/pronto/falha, confirmação autenticada de processamento e associação imutável entre ativo e versão. Valide limites de tamanho/duração no fluxo e documente-os como limites configuráveis. Nunca aceite asset de outro restaurante. Foto funciona enquanto vídeo não está pronto. Prévia administrativa não gera métricas de clientes.

Verifique criar categoria própria, cadastrar produto, publicar, trocar vídeo, pausar e reabrir catálogo em outra sessão. Teste upload inválido/falha e produto com categoria ocultada. Se faltar conta Stream, mantenha adapter preparado e indique essa pendência com precisão, sem declarar upload operacional.
```

## 4. Pedido da mesa e painel operacional

```text
Implemente o fluxo completo de pedidos descrito na arquitetura: sessão anônima protegida por cookie, sacola, nome/WhatsApp, mesa e confirmação. Crie mesas e links QR/NFC. Valide mesa, horários, disponibilidade e preços atuais no servidor. Recalcule total, congele itens no pedido e persista tudo em transação. Use chave de idempotência estável por tentativa e verifique payload repetido.

Conecte o painel Recebidos/Em preparo/Prontos/Entregues com ações explícitas, cancelamento com motivo, histórico e estimativa manual. Realtime autorizado para equipe, reconciliação após desconexão e acompanhamento do cliente por consulta automática a endpoint protegido pela sessão. Não exponha pedidos por telefone ou apenas pelo ID da URL. Recebido não significa que a cozinha iniciou.

Teste pedido de ponta a ponta em duas sessões, clique duplo/retry após timeout, preço alterado, item indisponível, mesa de outro restaurante, estabelecimento fechado, atualização concorrente e acesso de outra sessão ao pedido. O pedido só deve aparecer como enviado depois da confirmação do banco. Após sucesso, limpar somente a sacola correspondente.
```

## 5. Mini CRM e autorização de marketing

```text
Implemente contatos por restaurante e identifique nome/WhatsApp do pedido como dados de atendimento. Número informado é não verificado e não autentica cliente. Não dê acesso ao histórico por número nem sobrescreva identidade/consentimento existente em novo checkout. Mantenha snapshots de identificação por pedido.

Inclua checkbox opcional/desmarcado para ofertas do restaurante, registro de texto/versão/finalidade/origem/data e recusa independente do pedido. Crie cadastro opcional Receber novidades. No CRM, exiba nome, número, origem, datas, autorização e situação de verificação. Trate revogação com fluxo autorizado; não reative automaticamente. Ofereça canal de privacidade e política configurável de conservação dos dados.

Restrinja CRM ao dono. Campanhas automáticas e login por WhatsApp ficam fora da etapa; explique a pendência de integração/verificação para futuros envios. Teste pedido sem autorização, recusa, contato já revogado e acesso de funcionário sem permissão. Remova dados pessoais de logs e telemetria de vídeo.
```

## 6. Métricas observadas

```text
Implemente coleta e painel conforme definições de ARQUITETURA.md. Meça visualização qualificada, intervalos assistidos com reprodução/visibilidade reais, cobertura única do vídeo, inclusão na sacola e pedido persistido. Identifique produto, versão, posição e sessão. Deduplicate eventos e limite frequência e duração aceitas no servidor. Exclua demo e prévia administrativa.

Dashboard com período, total de sessões qualificadas, média/mediana de tempo, conclusão, ações de sacola e quantidade de produtos pedidos. Exiba denominadores e amostra pequena. Novo estabelecimento deve ver estados vazios. Produto com foto não tem métricas de tempo de vídeo. Troca de vídeo não mistura versões sem indicação.

Teste pausa, buffering, aba oculta, painel fora de tela, salto no vídeo, repetição, retry duplicado e mudança de versão. Explique limites da coleta pelo navegador e não use linguagem de causalidade para relacionar atenção com pedidos. Mostre como reproduzir a verificação com mídia de teste.
```

## 7. Revisão e preparo do piloto

```text
Revise o MVP conectado contra ACEITE-E-PILOTO.md. Execute os testes críticos, lint, typecheck e build. Percorra como cliente, dono e operação. Teste celular, tablet e computador, teclado, leitor de tela quando disponível, conexão lenta e reconexão. Revise design com frontend-design e emil-design-eng; apresente eventuais correções de UI no formato Before/After/Why exigido por Emil.

Corrija os problemas encontrados e rode novamente somente as verificações afetadas. Entregue README de configuração/deploy, migrations, variáveis, política de mídia e orientações para backup/recuperação, com custos e contas ainda necessários claramente identificados. Confirme isolamento entre dois restaurantes e ausência de dados sintéticos no painel conectado.

Prepare checklist para cadastrar o primeiro restaurante, dez produtos, três categorias, mesas e um pedido de teste. Registre o que está operacional e o que depende de configuração externa. Não marque a entrega pronta para pedidos reais enquanto os requisitos críticos de persistência, segurança e recuperação estiverem pendentes.
```

## Como continuar depois de uma interrupção

```text
Leia PRODUCT.md, TELAS-E-DESIGN.md, ARQUITETURA.md e CHECKPOINT.md. Inspecione o código e o estado das verificações. Retome a primeira etapa incompleta, preservando as decisões confirmadas. Conclua a etapa e atualize o checkpoint com evidências e pendências.
```
