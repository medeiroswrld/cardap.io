# Checklist manual da fundação

Passos que dependem das contas do responsável. Nenhum deles é feito pelo código.

## 1. Trocar credenciais expostas
1. Supabase → Project Settings → API: gerar nova `service_role` (e nova `anon`, se a antiga também foi exposta).
2. Vercel → projeto `cardap-io` → Settings → Environment Variables (Production): atualizar `SUPABASE_SERVICE_ROLE_KEY` (e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) como Secret.
3. Atualizar `.env.local` nas máquinas de desenvolvimento.
4. Redeploy e conferir login, pedido e upload.
5. Só então revogar as chaves antigas. Fazer o mesmo com o token do Cloudflare, se existir.

## 2. Domínio próprio
1. Comprar o domínio (ex.: Registro.br para `.com.br`).
2. Vercel → Settings → Domains → adicionar e configurar o DNS indicado.
3. Atualizar `NEXT_PUBLIC_APP_URL=https://<domínio>` em Production e fazer redeploy (a variável entra no build).
4. Supabase → Authentication → URL Configuration: Site URL = domínio novo; acrescentar `https://<domínio>/auth/confirm` aos redirects.
5. Gerar e imprimir QR das mesas somente depois disso.

## 3. E-mail (SMTP)
1. Criar conta no Resend, adicionar o domínio e publicar os registros DNS (SPF/DKIM).
2. Supabase → Authentication → SMTP Settings: host/porta/usuário/senha do Resend, remetente `nao-responda@<domínio>`.
3. Testar cadastro e "esqueci a senha" com um e-mail real.

## 4. Plano da Vercel
O plano Hobby é restrito a uso não comercial. Com restaurantes pagantes, migrar o projeto para o plano Pro.

## 5. Fotos já publicadas
`npm run optimize:photos` lista as fotos que seriam convertidas (simulação) e termina com uma linha de resumo; falhas em produtos individuais não interrompem a execução e fazem o comando sair com código 1 ao final. `npm run optimize:photos -- --apply` converte de verdade (não apaga originais). As métricas dessas fotos passam a contar como nova versão a partir da troca.
