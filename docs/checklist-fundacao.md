# Checklist manual da fundação

Passos que dependem das contas do responsável. Nenhum deles é feito pelo código.

## 1. Trocar credenciais expostas
1. Supabase → Project Settings → API: gerar nova `service_role` (e nova `anon`, se a antiga também foi exposta).
2. Vercel → projeto `cardap-io` → Settings → Environment Variables (Production): atualizar `SUPABASE_SERVICE_ROLE_KEY` (e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) como Secret.
3. Atualizar `.env.local` nas máquinas de desenvolvimento.
4. Redeploy e conferir login, pedido e upload.
5. Só então revogar as chaves antigas.
6. Cloudflare: enquanto existirem vídeos legados da Cloudflare, mantenha `CLOUDFLARE_ACCOUNT_ID` configurado (a política de segurança precisa dele no build). Rotacione o token do Cloudflare em vez de apagá-lo: atualize primeiro quem o usa e só então revogue o antigo. A simulação de `npm run optimize:photos` informa quantos vídeos legados existem.

## 2. Domínio próprio
1. Comprar o domínio (ex.: Registro.br para `.com.br`).
2. Vercel → Settings → Domains → adicionar e configurar o DNS indicado.
3. Atualizar `NEXT_PUBLIC_APP_URL=https://<domínio>` em Production e fazer redeploy (a variável entra no build).
4. Supabase → Authentication → URL Configuration: Site URL = domínio novo; acrescentar `https://<domínio>/auth/confirm` aos redirects.
5. Gerar e imprimir QR das mesas somente depois disso.
6. Atenção: o HSTS só é enviado quando `NEXT_PUBLIC_APP_URL` começa com `https://` no momento do build. Ele usa `includeSubDomains` com validade de 2 anos e, por isso, vale para todos os subdomínios do domínio próprio; confirme que nenhum deles precisa funcionar só em HTTP.

## 3. E-mail (SMTP)
1. Criar conta no Resend, adicionar o domínio e publicar os registros DNS (SPF/DKIM).
2. Supabase → Authentication → SMTP Settings: host/porta/usuário/senha do Resend, remetente `nao-responda@<domínio>`.
3. Testar cadastro e "esqueci a senha" com um e-mail real.

## 4. Plano da Vercel
O plano Hobby é restrito a uso não comercial. Com restaurantes pagantes, migrar o projeto para o plano Pro.

## Antes de publicar
- Compartilhe um `/r/<slug>` real, com foto WebP, no WhatsApp e teste a prévia no Sharing Debugger da Meta (https://developers.facebook.com/tools/debug/). Se a imagem da prévia não aparecer, uma rota de prévia em JPEG/PNG é uma melhoria futura.
- Envie uma foto de celular em pé (retrato), tirada em iPhone e em Android, e confirme que ela não aparece girada.
- Rode a simulação `npm run optimize:photos` e confira as contagens de fotos externas e de vídeos legados. Fotos fora do armazenamento do projeto serão bloqueadas pela nova política de segurança e precisam ser enviadas de novo.

## 5. Fotos já publicadas
`npm run optimize:photos` lista as fotos que seriam convertidas (simulação) e termina com uma linha de resumo; falhas em produtos individuais não interrompem a execução e fazem o comando sair com código 1 ao final. `npm run optimize:photos -- --apply` converte de verdade (não apaga originais). As métricas dessas fotos passam a contar como nova versão a partir da troca.

- Antes do `--apply`, converta/inspecione uma foto em pé conhecida para confirmar a orientação e a cor.
- Linhas "arquivo novo sem uso" indicam arquivos enviados que não ficaram vinculados a nenhum produto (o dono trocou a foto durante a conversão ou a atualização no banco falhou); são inofensivos e podem ser removidos depois.
- Depois do `--apply`, cardápios já abertos podem pedir por até 60 s a URL antiga da foto; essas visualizações são rejeitadas (ruído inofensivo).
- Fotos em Display-P3 podem ter uma leve mudança de cor.
