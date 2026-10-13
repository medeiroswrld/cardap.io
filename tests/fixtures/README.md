# Vídeo sintético para testes

`reel.webm` foi gerado localmente com FFmpeg; não contém conteúdo de terceiros nem é publicado no cardápio. O Playwright usa o arquivo por rota interceptada e por seleção no cadastro da demonstração, em contextos isolados de teste.

Comando de geração: `ffmpeg -f lavfi -i testsrc2=size=180x320:rate=10 -t 2 -c:v libvpx -b:v 80k -an reel.webm`.
