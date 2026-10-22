# Preparação do piloto

Em 22/10/2026, a migration 010 foi aplicada no Supabase e as duas variáveis abaixo foram cadastradas como Secret em Production no projeto `amplytecnologia-3734/cardap-io`. A troca das credenciais antigas expostas ainda não foi concluída. Conferir o commit/deployment ativo antes de considerar o código publicado.

## Ordem de publicação

1. Aplicar `supabase/migrations/010_pilot_rate_limits.sql` no projeto de produção.
2. Configurar `RATE_LIMIT_HASH_KEY` e `LOG_HASH_KEY` no ambiente Production da Vercel. Usar valores aleatórios diferentes, com pelo menos 32 caracteres; nunca usar prefixo `NEXT_PUBLIC_`, versionar ou imprimir os valores.
3. Publicar o código e verificar a criação de sessão, pedido e comentário em um restaurante de teste.
4. Concluir a rotação das credenciais expostas, atualizando todos os consumidores antes de revogar as antigas. A presença de uma chave no `.env.local` não comprova a revogação da anterior.

Sem a migration ou a configuração do limitador, as escritas protegidas retornam 503. Não publicar o código antes das etapas 1 e 2. Reutilizar uma sessão válida continua funcionando sem consumir a cota de novas sessões.

## Limites compartilhados

O Postgres conta tentativas de forma atômica em janelas fixas de dez minutos, separadas por restaurante:

| Ação               | Escopo             | Tentativas por janela |
| ------------------ | ------------------ | --------------------- |
| Criar sessão       | Endereço de origem | 60                    |
| Enviar pedido      | Endereço de origem | 120                   |
| Enviar pedido      | Mesa               | 12                    |
| Curtir ou comentar | Endereço de origem | 120                   |
| Curtir ou comentar | Sessão             | 30                    |

As duas cotas de cada ação são cumulativas. Tentativas inválidas após a validação inicial e reenvios também podem consumir cota. A idempotência do pedido permanece no RPC. Ao exceder a cota, a API retorna 429 com `Retry-After`; indisponibilidade do controle retorna 503, sem liberar a escrita. As regras anteriores por sessão continuam valendo.

Na Vercel, somente `x-vercel-forwarded-for` é usado como origem confiável; em outro host, todas as origens compartilham uma identidade de fallback por restaurante. Ver [documentação oficial de cabeçalhos da Vercel](https://vercel.com/docs/headers/request-headers). O endereço e o token são transformados por HMAC antes de chegar à tabela; nenhum dos dois é gravado nela. A chave inclui restaurante e ação para evitar correlação entre estabelecimentos.

A função é acessível somente pelo servidor (`service_role`); RLS e revogação bloqueiam clientes públicos. A limpeza oportunista remove no máximo 100 contadores vencidos há mais de uma hora por chamada. Sem tráfego, contadores antigos permanecem até uma próxima chamada. Isso não substitui um WAF nem protege todas as rotas contra ataques volumétricos. Clientes no mesmo Wi-Fi compartilham a cota de origem; validar os limites durante o piloto antes de ampliar o tráfego.

## Vídeos e capas

Ao escolher um vídeo na gestão, o navegador gera uma capa JPEG e a envia junto ao cadastro. Isso vale para novos uploads; não preenche automaticamente capas de vídeos antigos. O navegador precisa conseguir decodificar o arquivo. A compressão abaixo é uma ferramenta local de preparação, não uma conversão automática no upload.

Preparar vídeos antes de cadastrar:

```powershell
# Uma vez, se FFmpeg não estiver no PATH nem configurado em FFMPEG_PATH:
npm install --prefix .tools/ffmpeg --no-save --package-lock=false ffmpeg-static@5.3.0

npm run prepare:media -- "C:\caminho\originais" "C:\caminho\exportacao-nova"
```

A pasta de saída precisa ser nova. Cada `produto-XX` recebe `video.mp4` e `capa.jpg`. O processo mantém os originais, limita o vídeo aos primeiros 45 segundos, ajusta a imagem para caber em 720 × 1280, exporta H.264/AAC e antecipa os metadados para iniciar a reprodução mais cedo. A ordem numérica segue a enumeração dos arquivos: conferir o conteúdo antes de associá-lo a um prato. Uma falha pode deixar uma exportação parcial; usar outra pasta para tentar novamente.

Revisar imagem, áudio e duração antes de enviar. Nenhum vídeo real do restaurante foi convertido como parte dos testes automatizados; o teste usa um clipe sintético.

## Verificação

```powershell
npm run test:database
npm run test:observability
npm run test:media
npm run lint
npm run typecheck
npm run build -- --webpack
```

O teste de mídia requer FFmpeg e Chrome local, gera um clipe temporário, confere compressão/capa e testa a geração de capa no navegador. Não usa dados reais de clientes.

Validação de 22/10/2026: 45 verificações de banco, 11 testes de observabilidade/limites e um teste de mídia passaram; TypeScript, ESLint e build de produção com webpack passaram. Dois testes integrados contra o Supabase também passaram: interações/moderação/isolamento e ingredientes/adicionais/pedido/métricas de fotos. Esses testes criaram e limparam dados isolados. Para executar o build local em outra porta, definir `NEXT_PUBLIC_APP_URL` tanto no build quanto no start, porque essa variável é incorporada na compilação. A primeira tentativa em 3102 usando o build de outra origem foi corretamente recusada com 403; a repetição com a origem alinhada passou.

Antes de receber público: testar dois restaurantes e mesas diferentes, conferir destino do QR, abrir o cardápio em outro navegador, enviar um pedido com opcionais, acompanhar até entregue, testar curtidas/comentários e sua moderação, verificar fotos/vídeos e métricas. Um piloto assistido não equivale a prontidão para escala; SMTP/domínio, alertas, recuperação de backup e retenção de dados ainda precisam de decisão e validação operacional.
