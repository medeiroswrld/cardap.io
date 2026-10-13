# Stack e regras de implementação

## Escolhas

| Tecnologia | Função |
| --- | --- |
| Next.js App Router + TypeScript | Interface, rotas públicas, gestão e endpoints no mesmo projeto |
| Tailwind + shadcn/ui | Tokens próprios e componentes acessíveis; personalizar aparência |
| Supabase Postgres | Dados, transações e isolamento entre estabelecimentos |
| Supabase Auth | Login da equipe; validação da sessão no servidor |
| Supabase Storage | Fotos e logos com políticas de acesso |
| Supabase Realtime | Atualizações autorizadas no painel de pedidos |
| Cloudflare Stream | Processamento e entrega dos vídeos; upload direto autorizado pelo servidor |
| Zod | Validar entradas no servidor e contratos compartilhados |
| React Context/reducer | Sacola local por restaurante; dispensar biblioteca extra inicialmente |
| Playwright | Verificação dos fluxos críticos no navegador |
| Vercel | Hospedagem proposta; confirmar plano apropriado e orçamento antes do piloto |

Usar versões estáveis compatíveis, registrar no lockfile e seguir a documentação da versão instalada. O Next.js exige Node.js 20.9 ou superior na documentação consultada; usar uma versão LTS suportada. Contas, credenciais e custos de vídeo precisam ser configurados para a versão conectada. Ter um modo demonstração explícito permite desenvolver a interface antes disso.

## Dados

Entidades: restaurants, restaurant_members, categories, products, product_media, dining_tables, guest_sessions, contacts, marketing_consent_events, orders, order_items, order_status_events e video_view_sessions.

Todas as entidades do estabelecimento incluem `restaurant_id`. Aplicar políticas RLS e vínculos que impeçam referências cruzadas entre restaurantes. O usuário logado não escolhe livremente o tenant em um corpo de requisição: o servidor verifica sua associação e papel. Papéis iniciais: dono e operação. Chaves privilegiadas ficam exclusivamente no servidor.

Catálogo público mostra apenas produtos publicados. Contatos, pedidos e métricas detalhadas são privados. Rotas com dados pessoais não podem ser armazenadas em cache compartilhado.

## Pedido

1. Cliente recebe uma sessão anônima com token aleatório, armazenado como hash no banco e cookie HttpOnly/Secure em produção, SameSite e prazo de expiração. Não exigir login para navegar.
2. Checkout envia identificadores, quantidades, observações, mesa, identificação e chave de idempotência. Servidor valida origem/CSRF, limita requisições e verifica sessão.
3. Servidor verifica restaurante aberto/aceitando pedidos, mesa válida, publicação/disponibilidade e preços atuais. Recalcula total em centavos; se preço mudou, pede nova confirmação.
4. Criar pedido, itens com nome/preço congelados e primeiro evento numa transação. Repetir a mesma chave e payload retorna o mesmo pedido; payload diferente com mesma chave retorna conflito.
5. Só confirmar envio depois da gravação. Atualização de status verifica papel e transição permitida, com histórico persistido. Requisições concorrentes não podem retroceder ou duplicar eventos.
6. Painel usa Realtime autorizado e busca inicial/reconciliação ao reconectar. Cliente consulta endpoint restrito à sessão a cada 3–5 segundos enquanto acompanha; pausar consultas em aba oculta. Descrever como atualização automática, sem prometer latência instantânea.

`recebido → em_preparo → pronto → entregue`; recebido/em_preparo podem ser cancelados com motivo; exceções posteriores exigem ação autorizada e registro. Estimativa é informada pela equipe, não calculada por IA. Pagamento acontece no estabelecimento. O painel mostra valor dos pedidos, não faturamento pago sem confirmação financeira.

QR e NFC abrem o mesmo endereço HTTPS, associado à mesa. A aplicação gera URL/QR; a gravação da tag NFC é uma etapa física de implementação. Mesa no link não prova presença física; controle de recebimento e limites de requisições ajudam a lidar com pedidos indevidos.

## Vídeos e métricas

Upload: servidor valida usuário/tenant, cria URL temporária de upload no Stream e registra o ativo. Cliente envia diretamente ao provedor. Publicar vídeo somente após confirmação de processamento por webhook validado conforme mecanismo oficial vigente ou consulta autenticada. Não confiar em callback fornecido pelo navegador. Ter imagem de capa e estado de falha; original não sobe através de uma função serverless grande.

Um vídeo ativo, reprodução inicialmente sem som e `playsInline`. Controle de pausa/áudio; mídia seguinte pode ter metadados pré-carregados, sem baixar o catálogo inteiro. O modo lista permanece utilizável sem vídeo.

Definições propostas para o piloto:
- Visualização qualificada: ao menos 50% do painel visível por um segundo com reprodução ativa.
- Tempo assistido: soma de intervalos reais de reprodução com painel visível e documento ativo; excluir buffering, pausa e aba oculta. Não usar apenas diferença de `currentTime`, pois busca e loops distorcem.
- Conclusão: proporção de sessões qualificadas que assistiram ao menos 90% dos trechos distintos da duração. Repetições podem aumentar tempo total, mas não a cobertura única acima de 100%.
- Coletar versão/ativo, produto, posição, sessão e timestamps. Enviar lotes/heartbeat limitado, deduplicar eventos e limitar intervalos no servidor. Dados do navegador são estimativas observacionais, sujeitos a perda/bloqueio e manipulação.
- Associar eventos de sacola e pedido persistido por sessão/produto. Mostrar associação, nunca afirmar que um vídeo causou uma venda. Exibir denominador, período e aviso de amostra pequena.
- Excluir prévias da equipe e demonstração. Produto com foto não tem tempo assistido de vídeo. Novo estabelecimento vê estado vazio.

## Contatos e marketing

Nome/WhatsApp do checkout servem ao atendimento e aparecem no CRM autorizado. Número digitado é não verificado: não dá acesso a histórico, não autentica cliente e não deve sobrescrever identidade/consentimento de contato existente. Registrar identificação do pedido separadamente; consolidar contatos dentro do tenant com cuidado.

Checkbox opcional, desmarcado: “Quero receber novidades e ofertas do [Restaurante] no WhatsApp. Posso cancelar quando quiser.” Registrar finalidade, texto/versão, origem e data; recusa não bloqueia pedido. Recadastro não reativa autorização revogada automaticamente. Mostrar forma de solicitar revogação e canal de privacidade. Definir conservação e exclusão para o piloto; excluir telefone de logs e eventos de vídeo.

Campanhas automáticas ficam fora do MVP. Antes de habilitar envios, integrar provedor oficial, verificar vínculo com o número e aplicar regras vigentes de templates, consentimento e descadastro. Exportações do CRM também respeitam permissões e finalidade. O checkout não concede autorização automática para publicidade.

## Fontes consultadas em 11/10/2026
- [Next.js — instalação](https://nextjs.org/docs/app/getting-started/installation)
- [shadcn/ui — Next.js](https://ui.shadcn.com/docs/installation/next)
- [Supabase — autenticação no servidor](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — autorização Realtime](https://supabase.com/docs/guides/realtime/authorization)
- [Cloudflare Stream — upload direto](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/)
- [WhatsApp — política de mensagens](https://business.whatsapp.com/policy)
- [LGPD — texto oficial](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
