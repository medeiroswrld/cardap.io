# Revisão de observabilidade — 20/10/2026

Escopo: revisão estática de `src`, handlers HTTP, autenticação, integrações Supabase/Cloudflare, métricas de fotos/vídeos, erros no navegador e script de conexões. Implementação e testes locais. Não constitui pentest, inspeção dos logs históricos ou validação da configuração de produção.

## Achados e tratamento

| Prioridade | Local / problema encontrado                                                                                                                                | Tratamento                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta       | `src/lib/server-security.ts`: `apiError` não registrava erros e devolvia 400 para falhas inesperadas de banco/rede.                                        | Classificação por códigos permitidos, eventos JSON, falhas inesperadas 500 e dependências indisponíveis 503. Rejeições conhecidas continuam 4xx.                                             |
| Alta       | Todos os handlers de `src/app/api`: sem requestId, ação, duração ou evento de conclusão; retornos diretos escapavam dos catches.                           | 20 métodos de API + callback de autenticação envolvidos por `withRequestLogging`. Teste verifica cobertura de todos os exports.                                                              |
| Alta       | `supabase/server.ts`, `orders/[orderId]`, `session` e `media`: consultas ignoravam `error`, confundindo indisponibilidade com ausência de dados/permissão. | Erros de infraestrutura propagados; ausência esperada continua tratada como 401/403/404.                                                                                                     |
| Alta       | `api/auth`: logout ignorava resultado; recuperação/login não tinham diagnóstico; callback rejeitado aparecia só como redirect.                             | Logout verifica erro, falhas de autenticação classificadas, callback registra rejeição sem código ou URL.                                                                                    |
| Média      | `workspace`: catch vazio na sincronização de vídeos; `sync-video.ts` marcava vídeos inválidos sem evento.                                                  | `video.sync_deferred` e `video.rejected`, preservando o carregamento da gestão.                                                                                                              |
| Média      | `cloudflare.ts`: respostas upstream sem contexto; `catalog.ts`: falhas genéricas.                                                                          | Operação e status HTTP seguros, sem corpo, URL de upload ou credencial.                                                                                                                      |
| Média      | `supabase/server.ts`: escrita de cookie falhava silenciosamente.                                                                                           | Falhas em handlers agora são registradas e propagadas. Cookies somente leitura em Server Components continuam sendo uma condição esperada.                                                   |
| Média      | `proxy.ts`: refresh de autenticação ignorava erros; página de gestão convertia qualquer erro em 404.                                                       | Proxy registra falhas de infraestrutura; página deixa erros internos chegarem ao hook do Next. Verificação de autorização continua nos handlers/páginas.                                     |
| Média      | `client-api.ts`: JSON inválido com HTTP 200 era tratado como sucesso.                                                                                      | Erro explícito e referência de suporte quando disponível.                                                                                                                                    |
| Pendente   | `connected-menu-provider.tsx`: refresh, associação de sacola e localStorage têm fallbacks silenciosos.                                                     | Servidor agora observa requisições recebidas. Falhas antes de chegar ao servidor continuam sem coleta central. Preservar pedido confirmado mesmo se persistência local falhar é intencional. |
| Pendente   | `use-video-observation.ts`, `use-photo-observation.ts`: erro de rede pode perder métricas sem aviso.                                                       | Falhas HTTP no servidor têm log; falta monitoramento seguro do navegador e política de reenvio limitada/idempotente. Não interromper pedidos por falha de telemetria.                        |
| Pendente   | `product-feedback.tsx`: carregamento secundário/refresh pós-gravação pode falhar; `app/error.tsx` não reporta erros exclusivamente do cliente.             | Necessária coleta dedicada no navegador com amostragem, esquema fechado e limite de requisições.                                                                                             |
| Esperado   | `product-media.tsx`: `play().catch` por bloqueio de autoplay; armazenamento IndexedDB/localStorage da demonstração.                                        | Não transformar bloqueios normais do navegador em incidentes de produção.                                                                                                                    |

## Implementação

Pino 10.4.0 em `src/lib/observability/core.ts`, com fachada exclusivamente de servidor em `logger.ts`. Saída JSON para stdout, apropriada à coleta de funções serverless, sem arquivos locais, pretty printing ou transportes externos. AsyncLocalStorage isola chamadas concorrentes.

Cada chamada instrumentada gera UUID próprio (ignora `X-Request-ID` recebido), registra ação com **template estático** e devolve `X-Request-ID`. O cliente apresenta essa referência em erros de `requestJson`. IDs de produtos/restaurantes, slugs e parâmetros não compõem a ação. `request.completed` inclui status e duração; `request.failed` acrescenta diagnóstico. Para contabilizar taxa de erro, usar apenas `request.completed`, evitando contagem dupla.

`src/instrumentation.ts` registra inicialização e erros capturados pelo Next em runtime Node. Erros de renderização e proxy usam um ID de evento próprio; **não há rastreamento distribuído nem correlação completa entre proxy, renderização, navegador e provedores**. Falhas de inicialização anteriores à carga do módulo, encerramentos abruptos e logs internos das plataformas exigem monitoramento da infraestrutura.

| Nível   | Uso                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `info`  | Inicialização e requisições concluídas sem erro.                                                                                       |
| `warn`  | Rejeições 4xx, vídeo rejeitado, sincronização adiada e configuração opcional ausente.                                                  |
| `error` | Falha 5xx, dependência indisponível ou erro de renderização.                                                                           |
| `fatal` | Interface disponível para falha irrecuperável do serviço; não usada para erros de requisição e não encerra o processo automaticamente. |

## Proteção de dados

O mecanismo principal é **projeção por lista de campos e valores permitidos**, não uma expressão regular aplicada depois que o segredo já foi serializado. Campos extras e estruturas aninhadas são descartados. O logger não serializa erros completos, stack/cause, mensagens livres, objetos de requisição/resposta, headers, cookies, bodies, URLs, códigos OAuth, nomes, e-mails, telefones, comentários, senhas, tokens ou chaves de API. Getters e `toJSON` não são executados durante a projeção. Configuração `redact` do Pino fornece uma segunda camada.

`userId` recebe um HMAC-SHA256 do identificador **já autenticado**, nunca o identificador original. Isso é pseudonimização, não anonimização: ainda requer controle de acesso e retenção. Não registramos identificadores de visitantes nem hashes de cookies. Sem `LOG_HASH_KEY` forte, omitimos `userId` e emitimos `logger.identity_disabled`. O ID não é inferido do corpo de login.

ESLint proíbe `console.*` em `src` e importação direta de Pino fora do módulo aprovado. A fachada não expõe o logger bruto nem aceita texto livre para eventos. Ao adicionar evento/rota/código, atualizar a lista estática e os testes, sem acrescentar payloads ou error.message.

Os testes protegem a saída **deste logger**. Não é possível estender essa garantia automaticamente a logs nativos do Next, Vercel, Supabase, Cloudflare, ferramentas de CI ou registros anteriores. Revisar configurações desses destinos antes de afirmar que o sistema inteiro não retém dados pessoais. `scripts/check-connections.mjs` já restringe a saída a campos diagnósticos, mas é ferramenta administrativa separada da fachada.

## Configuração e operação

- `LOG_LEVEL=info` por padrão. Valores aceitos: `info`, `warn`, `error`, `fatal`. Valores inválidos usam `info`; não permitir `silent` em produção.
- `LOG_HASH_KEY`: segredo aleatório exclusivo com pelo menos 32 caracteres, configurado no ambiente do servidor. Não reutilizar chave do Supabase/Cloudflare nem usar prefixo `NEXT_PUBLIC_`. Rotação muda pseudônimos e rompe correlação com períodos anteriores.
- Configurar `LOG_HASH_KEY` no ambiente de implantação para habilitar contexto de usuário. A preparação e a ordem de publicação do piloto estão em `docs/piloto.md`.
- Exportar stdout para destino central com acesso restrito, retenção definida e descarte automático. Isso ainda não foi contratado/configurado.
- Alertas propostos: qualquer `fatal`; aumento sustentado de 5xx; latência p95 acima da meta definida; aumento de `video.sync_deferred`/`dependency.failed`; ausência de sinais esperados. Criar alertas em cima de `request.completed` para evitar duplicação e agrupar por ação, nunca por userId/requestId como dimensão de métrica.
- Definir painéis, SLOs, amostragem para alto volume de métricas, testes sintéticos e tracing de dependências. Não implementados nesta etapa.

## Verificação

`npm run test:observability` testa JSON, níveis e filtro, exclusão de sentinelas de segredos/PII, objetos circulares/getters/toJSON, códigos desconhecidos, HMAC, isolamento concorrente, cabeçalhos/cookies, redirects imutáveis, respostas 500 seguras e cobertura dos handlers. Não usa credenciais reais nem serviços externos.

Executar também `npm run lint`, `npm run typecheck` e `npm run build -- --webpack` antes de implantar. Esta revisão não é garantia de ausência de vulnerabilidades.

Resultado desta execução: **9 testes passaram**, lint e TypeScript passaram e o build de produção com webpack concluiu. Smoke HTTP em servidor dedicado local na porta 3102 validou três respostas (403, 404, 400), os respectivos eventos JSON correlacionados e ausência de uma sentinela sensível enviada em cabeçalho/corpo. O processo de teste foi encerrado. Nenhum dado real de restaurante foi alterado e nenhuma implantação foi feita nesta etapa.

Durante a instalação, `npm audit` informou cinco entradas de severidade alta na cadeia de desenvolvimento `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` ([advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)). Não são cinco falhas independentes do logger. O ajuste automático sugerido faria downgrade major do ESLint do Next; não foi aplicado. Tratar em atualização de dependências separada, validando compatibilidade.

`npm audit --omit=dev` retornou zero vulnerabilidades conhecidas nas dependências de produção nesta consulta. Esse resultado não cobre falhas de lógica, autorização, configuração ou vulnerabilidades ainda não catalogadas.

Referências: [Pino redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md), documentação de instrumentação e route handlers da versão instalada em `node_modules/next/dist/docs/`.
