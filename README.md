# Brasa — cardápio e gestão

Aplicação construída a partir de PRODUCT.md, TELAS-E-DESIGN.md, ARQUITETURA.md e das quatro referências. Os documentos originais foram preservados.

## Executar

Requisito: Node.js LTS compatível (desenvolvido com Node 24.13.0).

```sh
npm ci
npm run dev
```

- Cardápio: http://localhost:3000/r/demo
- Mesa identificada: http://localhost:3000/r/demo?mesa=4
- Gestão do restaurante (exige login): http://localhost:3000/gestao
- Gestão da demonstração (também exige login): http://localhost:3000/demo/gestao
- Login conectado: http://localhost:3000/login

`/` encaminha para a gestão: visitantes entram em `/login` e usuários autenticados seguem para seu restaurante. O cardápio público fica em `/r/[slug]` e não contém atalhos para a gestão. A antiga gestão de demonstração também valida a sessão no servidor antes de renderizar. Use o mesmo navegador e duas abas para experimentar pedido e gestão. Os dados ficam no localStorage, no namespace `brasa:demo:v1`. O checkout é um teste local, não um pedido real. Use dados fictícios. Limpar os dados do site reinicia a demonstração. Outro navegador possui outra demonstração, sem sincronização entre dispositivos.

## O que está utilizável

- Cardápio imersivo: mídia ocupa toda a altura da tela, sem barras de compra ou sacola aberta. Nome/preço e ícones ficam sobrepostos. Deslize vertical troca produto; lateral troca categoria. Detalhes, compra, sacola e busca abrem em painéis. Lista tradicional continua disponível pelo ícone superior.
- Fotos locais, detalhe de ingredientes/alergênicos, observação e quantidade. No modo imersivo, o vídeo ativo inicia sem som (respeitando movimento reduzido e bloqueios do navegador); pausa fora da tela/aba ou ao abrir painéis. Pausa e áudio continuam controláveis. Na lista/prévia, a reprodução é manual.
- Sacola persistente; checkout com mesa, nome, telefone e marketing opcional/desmarcado. Revalidação de preço, disponibilidade e pausa da operação.
- Pedido de demonstração salvo antes da confirmação; acompanhamento pelo identificador de sessão local, sem acesso por telefone.
- Gestão com visão geral, quadro de pedidos, transições explícitas, cancelamento com motivo e estimativa manual.
- Produtos com edição, seletor único de foto ou vídeo do dispositivo, prévia, publicação/rascunho, disponibilidade, cópia e arquivamento. Categorias com nome, ordem, visibilidade e realocação.
- Contatos com registro da escolha e revogação. Um novo pedido não reativa consentimento nem substitui o nome de um contato existente.
- Métricas locais de vídeos com visualizações qualificadas, tempo médio assistido, conclusão e filtros por produto/período. Atualizam entre abas e persistem no navegador por até 30 dias (máximo 10.000 registros). Fotos e prévias do cadastro não contam; dados da demo não são enviados ao Supabase.
- Perfil, mesas, links e download de QR. O link pode ser gravado em NFC por equipamento externo.
- Prévia de papéis dono/operação. A troca de perfil da demo não é um mecanismo de segurança.

## Modo conectado ao Supabase

Acesse /login para criar sua conta e depois /gestao para cadastrar o restaurante. O endereço público é /r/seu-endereco. Esse ambiente usa dados reais do Supabase; a demonstração continua isolada em /r/demo e /demo/gestao.

O painel conectado inclui produtos, upload de fotos no Storage, categorias, pedidos por etapa, contatos, configurações, horários e QR das mesas. Donos gerenciam o restaurante; operações acessam os pedidos. O painel usa Realtime e reconciliação a cada 15 segundos; o cliente consulta seu pedido a cada 5 segundos enquanto a aba está visível. O acesso é restrito ao cookie de sessão, nunca ao telefone informado.

O restaurante nasce pausado. Cadastre produtos publicados, mesas, horários e o contato de privacidade, depois habilite os pedidos. O pagamento acontece no estabelecimento.

O cardápio conectado consulta alterações a cada 15 segundos enquanto está visível e ao voltar para a aba. Produtos, preços e vídeos prontos são atualizados sem recarregar a página e sem apagar a sacola. Compartilhe `/r/seu-endereco`: `/r/demo` contém somente a demonstração local, que não compartilha dados entre localhost, Vercel ou outros navegadores.

As migrations 001 a 004 foram aplicadas no projeto fornecido. Verificação no painel: 14 tabelas públicas, todas com RLS habilitado. As APIs pública e de servidor responderam 200. Não execute novamente essas migrations nesse projeto.

### Supabase

1. Crie um projeto próprio para homologação. Copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_APP_URL` com a origem exata do app.
3. Para um NOVO projeto vazio, execute os arquivos de `supabase/migrations` em ordem numérica. No projeto fornecido, as migrations já foram aplicadas.
4. Configure a URL do site e os redirecionamentos de Auth para `/auth/confirm`. Ative confirmação de e-mail e configure SMTP para entrega confiável. Nenhum login/senha é fornecido ou embutido.
5. As entidades têm `restaurant_id`, chaves compostas e RLS. Dono gerencia catálogo; operação pode consultar pedidos e usar a função de transição. Contatos e métricas são restritos ao dono.
6. `onboard_restaurant` cria restaurante fechado e categorias para o usuário autenticado. Preencha horários estruturados, mesas e produtos. Horários são intervalos dentro do mesmo dia; para atravessar meia-noite, cadastre dois intervalos em dias adjacentes.
7. A suíte `npm run test:database` executa 24 verificações transacionais e de RLS em PostgreSQL embarcado. Ela representa Auth/Storage localmente e não substitui a validação hospedada. `supabase/tests/isolation.sql` é opcional para homologação descartável com pgTAP. Execute também ACEITE-E-PILOTO.md antes de um piloto.

### Contratos de pedido

| Endpoint | Comportamento |
|---|---|
| `POST /api/restaurants/:id/session` | Reutiliza sessão válida ou cria token aleatório; guarda somente hash no banco; cookie HttpOnly/SameSite Strict, Secure em produção, expira em 12 horas. |
| `POST /api/restaurants/:id/orders` | Valida origem e entrada Zod; RPC transacional revalida restaurante, horário, mesa, catálogo, preço e quantidades; congela os itens e registra status/consentimento. |
| `GET /api/restaurants/:id/orders/:orderId` | Filtra restaurante, pedido e sessão do cookie; respostas privadas sem cache. |
| `PATCH /api/restaurants/:id/orders/:orderId` | Valida associação e transição, bloqueia a linha e exige status esperado para detectar concorrência. |

`place_guest_order` serializa tentativas da mesma sessão, compara hash do payload por chave e limita pedidos por sessão. Ainda é obrigatório configurar limite por IP/origem e proteção da criação de sessões no provedor de hospedagem; múltiplas sessões podem contornar o limite por sessão. A persistência de demonstração não oferece transações/distribuição de banco e não deve ser usada para operação real.

### Cloudflare Stream e fotos

- Preencha `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_STREAM_API_TOKEN`, com permissão limitada ao Stream da conta.
- O endpoint `POST /api/restaurants/:id/media` exige dono, valida produto/tenant e devolve upload direto temporário, limitado a 45 segundos.
- A confirmação em `PATCH` consulta o provedor com autenticação; não aceita um estado de processamento declarado pelo navegador. Somente o servidor pode gravar os estados de mídia.
- O campo “Escolher foto ou vídeo” aceita arquivos do dispositivo, mostra uma prévia e valida tipo, tamanho e duração. Ao salvar, fotos vão ao Storage e vídeos MP4/MOV/WebM de até 45 segundos e 200 MB vão diretamente ao Stream. Produtos novos são salvos antes de iniciar o envio, sem exigir fechar e reabrir o cadastro. Falhas de vídeo mantêm o arquivo selecionado para tentar novamente. O cadastro confere o processamento a cada 5 segundos; o painel também reconcilia até 5 mídias pendentes por atualização. Mantenha a gestão aberta até aparecer “Vídeo pronto para o cardápio”; ainda não há webhook independente do painel. O botão “Verificar processamento” permite tentar novamente após uma falha. HLS no cardápio funciona via player nativo ou hls.js, com foto em caso de falha. TUS para arquivos maiores não está implementado.
- Verificação de 13/10/2026 no ambiente local: Stream retornou 401 (código 10000). Fotos continuam funcionais; upload real de vídeo depende da correção da conta/permissão do token. Confira também `NEXT_PUBLIC_APP_URL` na Vercel: essa origem é usada nas permissões de reprodução dos novos uploads.
- Bucket preparado `restaurant-media`: imagens JPEG/PNG/WebP até 5 MB, caminho começando pelo UUID do restaurante e escrita por dono. Fotos desse bucket são públicas; não envie documentos ou dados pessoais nele.
- Na demo, fotos de até 1 MB ficam no armazenamento local e vídeos de até 45 segundos/200 MB ficam no IndexedDB, com reprodução após recarregar a página. O limite disponível depende do navegador; arquivos locais não são compartilhados com outros dispositivos. Não é necessário informar links. Nenhum vídeo de terceiros foi incluído. Fontes das fotos em `public/images/SOURCES.md`.
- Nunca use prefixo `NEXT_PUBLIC_` para chaves privilegiadas. Elas só são importadas por módulos server-only.

## Limites atuais

- Convites da equipe são administrados no Supabase; não há envio de convites no app. Usuários de operação precisam de associação em `restaurant_members`.
- Recuperação/cadastro de senha têm rotas implementadas; entrega de e-mail depende das configurações Auth/SMTP do projeto.
- O prazo de revisão de dados nas configurações é informativo. Não existe exclusão automática por retenção.
- Métricas observam versão, reprodução visível, tempo e cobertura. A associação mostra sessões que viram o vídeo e também adicionaram ou pediram o mesmo produto no período; não indica causalidade, ordem dos eventos ou pagamento. Pedidos cancelados também entram nessa associação.
- Configure limite por IP na hospedagem, backup/restauração e procedimento de privacidade antes de uso público.

## Verificações

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:database
npm run check:connections
```

Os testes Playwright usam um navegador instalado via `npx playwright install chromium`. Se já houver Chromium no ambiente, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE` com o caminho completo. `PLAYWRIGHT_BASE_URL` permite testar outra porta/instância. Capturas ficam em `.impeccable/review/`. Os testes usam contextos isolados e dados fictícios.

Na validação de 12/10/2026, os 16 cenários passaram em lotes: 15 na rodada completa e um após corrigir a inicialização do seletor de perfil da demonstração. O teste real confirmou login, onboarding, foto no Storage, sacola, consulta de associações, pedido, acompanhamento e isolamento. Ele exige `RUN_CONNECTED_LIVE=1` e autorização explícita para criar e remover duas contas e restaurantes temporários, uma foto e um pedido. Sem essa opção, o cenário hospedado é ignorado. Não execute dois processos Playwright simultaneamente.

Auditoria de dependências nesta entrega: `npm audit --omit=dev` sem vulnerabilidades. O audit completo reportou cinco ocorrências altas na cadeia de desenvolvimento `eslint-config-next → fast-glob → micromatch → braces` (GHSA-vfj7-8cjw-p6xm). Não foi aplicado `audit fix --force`, pois a sugestão envolve downgrade incompatível da configuração Next. Não alimentar o lint com padrões glob não confiáveis; acompanhar atualização upstream.

## Deploy e recuperação

- Vercel ou ambiente Node compatível: `npm ci`, `npm run build`, `npm start`. Configure variáveis e a URL HTTPS, depois confira cookies, origens e redirects.
- Publicação: `https://cardap-io-lilac.vercel.app`. Em 13/10/2026, foram configuradas as seis variáveis de produção na Vercel, com as credenciais de servidor salvas como Secret e `NEXT_PUBLIC_APP_URL=https://cardap-io-lilac.vercel.app`. O redeploy do commit `705cd45` ficou Ready e o login foi ativado. Entrega de e-mail e redirects Auth no Supabase continuam precisando de validação. A demo mantém seu aviso; os slugs reais carregam apenas dados reais.
- Supabase, Stream, hospedagem, domínio e SMTP podem ter custos; planos, volume e orçamento não foram contratados nesta entrega.
- Antes do piloto, configure backups/retention no plano Supabase, exportações protegidas e um teste real de restauração em ambiente separado. Defina retenção/exclusão dos contatos, imagens e vídeos com o restaurante.
- Não há backup remoto dos dados de demonstração. Um reset do navegador elimina os testes locais.
- Defina alternativa operacional com a equipe em queda de conexão. Nenhum pedido deve ser tratado como recebido sem confirmação persistida do backend conectado.

Fontes de implementação: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Cloudflare Stream](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/).


### Testes da área autenticada

Os testes da interface de gestão da demonstração exigem `PLAYWRIGHT_ADMIN_STORAGE_STATE`, apontando para um storage state de uma conta de teste autenticada no mesmo ambiente. Guarde o arquivo em `playwright/.auth/` (ignorado pelo Git). Sem essa sessão, somente esses cenários são ignorados; os testes públicos e de bloqueio de acesso seguem ativos. Não há senha fixa nem bypass de autenticação para testes. O fluxo conectado completo continua opt-in via `RUN_CONNECTED_LIVE=1`.
