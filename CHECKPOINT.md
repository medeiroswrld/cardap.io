# Checkpoint — Brasa

Atualizado em 12/10/2026. Documentos e referências originais preservados.

## Estado da entrega

Aplicação Next.js com demonstração isolada e ambiente conectado ao Supabase fornecido. Credenciais somente em `.env.local`, ignorado pelo controle de versão. Nenhuma conta permanente foi criada para o dono.

- `/r/demo` e `/demo/gestao`: demonstração explícita com dados fictícios no navegador.
- `/login` e `/gestao`: autenticação e cadastro do restaurante real.
- `/gestao/[id]`: produtos, fotos, categorias, pedidos, contatos, métricas, configurações e QR das mesas.
- `/r/[slug]`: cardápio público real, sacola, checkout e acompanhamento restrito à sessão do cliente.

## Banco e fluxos conectados

Migrations 001 a 004 aplicadas. O SQL Editor confirmou 14 tabelas públicas, todas com RLS. Donos e operações têm permissões diferentes. Fotos usam Supabase Storage; pedidos são transacionais, revalidam preços/horários/mesa/disponibilidade e usam chave de idempotência. Transições exigem o estado esperado. Atualizações da equipe usam Realtime com reconciliação periódica; cliente consulta o pedido enquanto a aba está visível.

Consentimento de marketing é opcional e separado do atendimento. Revogação não é revertida por outro pedido. Coletor de vídeo considera visibilidade, tempo real e cobertura de trechos distintos; prévias da equipe são excluídas. Associações por produto/versão contam sessões que também adicionaram ou pediram no período, sem afirmar causalidade, ordem dos eventos ou pagamento.

## Evidências

- TypeScript, lint e build de produção passaram.
- 24 verificações locais de banco passaram: isolamento, permissões, transações, preços, idempotência, consentimento, estados, métricas e associações. PostgreSQL embarcado usa representações locais de Auth/Storage e não substitui os serviços hospedados.
- Teste real de login, onboarding, publicação com foto, pedido mobile, atualização de status e isolamento entre dois restaurantes passou. Contas, restaurantes, foto e pedido temporários são removidos ao terminar.
- 16 cenários de navegador passaram em lotes: 15 na rodada completa (incluindo o teste hospedado com sacola e consulta de associações) e o cenário de categorias/perfil após correção da inicialização do seletor. Não afirmar que a primeira rodada completa passou sem falhas.
- Auditoria de dependências de produção: zero vulnerabilidades. Limitações da cadeia de desenvolvimento estão no README.
- Revisão visual independente: SHIP no escopo de gestão conectada desktop/mobile e acompanhamento mobile. Não equivale a certificação geral de produção ou acessibilidade.
- Capturas em `.impeccable/review/`. Sem teste com leitor de tela real, dispositivo físico ou rede móvel degradada.
- Launcher/detector Impeccable falhou com `cache_directory_failed`; revisão manual e por subagente utilizada. Não registrar detector como aprovado.

## Dependências externas e limites

1. Cloudflare Stream continua retornando HTTP 403, código 10002. Corrigir Account ID/permissão Account → Stream → Edit e validar upload/reprodução reais. Fotos já funcionam. Upload direto limitado a 200 MB/45 segundos; TUS para arquivos maiores não implementado.
2. Cadastro e recuperação de senha têm rotas prontas, mas entrega de e-mail e redirects Auth/SMTP precisam de validação no projeto.
3. Equipe é associada pelo Supabase; não há interface de convites.
4. Prazo de revisão dos dados é informativo; não existe exclusão automática por retenção.
5. Aplicação ainda não publicada. Hospedagem precisa de HTTPS, origem exata, limites por IP/criação de sessão e configuração das variáveis.
6. Definir e testar backups/restauração, retenção e alternativa de atendimento antes do piloto público, conforme ACEITE-E-PILOTO.md.

## Comandos

### Correção do feed em 12/10/2026

Pedido do usuário: navegação vertical como Reels. Implementado viewport de 100dvh, um prato por área visível, snap obrigatório, gesto de toque, roda do mouse, teclado e botão próximo. No celular, mídia de borda a borda e categorias na base; a sacola ocupa seu próprio espaço e preserva o prato alinhado. O mesmo componente atende demonstração e catálogo conectado. Lista e busca continuam disponíveis.

Verificação desta alteração: 17 testes de interface passaram, incluindo quatro cenários de Reels em 1440×1000, 390×844, 375×667 e 320×568, gestos nativos de toque, encaixe após adicionar à sacola, categorias e teclado. Lint, TypeScript e build passaram. Capturas finais `reels-desktop.png`, `reels-390.png`, `reels-375.png` e `reels-320.png` em `.impeccable/review/`. Nenhum novo dado foi criado no Supabase nesta alteração.

`npm run dev`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run test:database` e `npm run check:connections`.

O teste hospedado é opt-in via `RUN_CONNECTED_LIVE=1`. Ele cria e remove dois usuários e restaurantes temporários, uma foto e um pedido; executar somente com autorização para esse ambiente. Testes de navegador devem ser executados em um único processo por vez, pois compartilham a pasta de resultados.

## Revisão imersiva após novo feedback

O usuário rejeitou também o feed com barras de compra. A implementação atual substitui esse modo por `ImmersiveMenu`: foto/vídeo em toda a altura da tela, controles e textos sobrepostos, sem cabeçalho de loja, busca fixa, faixa de preço, botão Adicionar ou sacola aberta. O modo lista continua disponível. Deslizar verticalmente troca produtos; lateralmente troca categorias. Detalhes/compra, sacola, informações e busca abrem painéis. Controles dos pratos fora da tela ficam inativos e ocultos da árvore de acessibilidade.

Vídeo ativo inicia sem som quando permitido e sem preferência de movimento reduzido; pausa ao sair da tela/aba e ao abrir painéis. A captura sintética para testar vídeo fica em `tests/fixtures/reel.webm`, gerada localmente e entregue somente por uma rota interceptada no teste. Não foi publicada mídia de teste nem criado dado novo no Supabase. A pendência da Cloudflare continua independente desta revisão.

Verificação final: 18 cenários de interface aprovados em lotes — 17 na rodada conjunta de app, acessibilidade e gestos; o cenário de vídeo passou isoladamente após corrigir a espera de inicialização do armazenamento na preparação do teste. Inclui gestos em 1440×1000, 390×844, 375×667 e 320×568, compra em painel, busca, sacola, categorias e reprodução/pausa de vídeo. Lint, TypeScript e build de produção passaram. Capturas atuais: `immersive-1440.png`, `immersive-390.png`, `immersive-375.png` e `immersive-320.png` em `.impeccable/review/`. Esta validação não inclui upload real no Cloudflare nem nova execução do teste hospedado no Supabase.


## Seleção de vídeo no cadastro — 12/10/2026

Removido o campo de URL da demonstração. Demo e gestão conectada usam o mesmo seletor “Escolher foto ou vídeo”, com prévia, validação de formato/tamanho e duração máxima de 45 segundos. Fotos: 1 MB na demo, 5 MB conectado. Vídeos: até 200 MB. Na demo, vídeos são guardados no IndexedDB e resolvidos para reprodução após recarregar; fotos continuam no armazenamento local. Arquivos não são enviados ao servidor no modo demo.

No cadastro conectado, o arquivo fica selecionado até salvar. O produto é salvo antes do upload de vídeo, permitindo selecionar vídeo já no cadastro novo. Fotos seguem pelo Supabase Storage e vídeos pelo upload direto do Stream. Falha de upload mantém o formulário e arquivo para nova tentativa; processamento aparece no próprio cadastro. A permissão do Stream permanece pendente; não houve upload real nem criação de dados no Supabase nesta alteração.

Validação: três testes locais passaram (cadastro de vídeo + persistência/reprodução, foto/arquivos inválidos/cancelamento, e controle de reprodução no Reels). Lint, build e TypeScript passaram. Capturas `video-picker-desktop.png` e `video-picker-mobile.png` em `.impeccable/review/`.


## Métricas da demonstração — 12/10/2026

A tela da demo ainda tinha números fixos “—” e o observador exigia metadados do catálogo conectado, por isso vídeos enviados localmente não geravam métricas. Agora o observador registra reproduções locais em `brasa:demo:video-views:v1`, separado dos dados do restaurante, com retenção de 30 dias e limite de 10.000 registros. O painel calcula visualizações qualificadas (1 segundo visível), média de tempo e conclusão (90% de cobertura distinta), com filtros por produto/período, persistência e atualização entre abas. Fotos e prévias do cadastro não contam. Pausas não acumulam tempo; finais e voltas do vídeo são considerados na amostragem.

No painel conectado, associações com sacola/pedidos passam a ser consultadas novamente quando as métricas são atualizadas, a cada reconciliação do workspace. O estado vazio explica que acessos autenticados da própria equipe não contam e orienta testar como cliente em janela anônima. Não houve alteração de permissões nem gravação no Supabase nesta correção.

Validação desta correção: quatro testes passaram (métricas locais com vídeo enviado, exclusão de fotos, controles de reprodução e cobertura de trechos). Lint, TypeScript e build passaram. Captura do teste em .impeccable/review/demo-metrics-working.png; dados do vídeo sintético pertencem somente ao contexto isolado do teste.
