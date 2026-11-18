@echo off
rem Fome Play - instalador da impressao automatica de pedidos.
rem Escolhe a impressora termica, cria o atalho "Fome Play Pedidos" na area
rem de trabalho e na pasta Inicializar. O atalho abre o Chrome num perfil
rem separado, que imprime direto na impressora padrao sem abrir a janela.
setlocal
title Fome Play - impressao automatica

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" goto semchrome
set "PERFIL=%LocalAppData%\FomePlayPedidos"

echo.
echo Impressoras instaladas neste computador:
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-CimInstance Win32_Printer | Sort-Object Name); if($p.Count -eq 0){exit 2}; for($i=0;$i -lt $p.Count;$i++){ '  ' + ($i+1) + ' - ' + $p[$i].Name }"
if errorlevel 2 goto semimpressora
if errorlevel 1 goto falha

:escolher
echo.
set "NUM="
set /p "NUM=Digite o numero da impressora termica e aperte Enter: "
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-CimInstance Win32_Printer | Sort-Object Name); $n=0; if(-not [int]::TryParse($env:NUM,[ref]$n) -or $n -lt 1 -or $n -gt $p.Count){exit 3}"
if errorlevel 3 goto numeroinvalido
if errorlevel 1 goto falha

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=@(Get-CimInstance Win32_Printer | Sort-Object Name); $n=[int]$env:NUM; Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows' -Name LegacyDefaultPrinterMode -Type DWord -Value 1; $r=Invoke-CimMethod -InputObject $p[$n-1] -MethodName SetDefaultPrinter; if($r.ReturnValue -ne 0){exit 4}; Write-Host ('Impressora padrao: ' + $p[$n-1].Name)"
if errorlevel 1 goto falha

powershell -NoProfile -ExecutionPolicy Bypass -Command "$q=[char]34; $w=New-Object -ComObject WScript.Shell; $a='--user-data-dir=' + $q + $env:PERFIL + $q + ' --kiosk-printing --no-first-run --new-window https://fomeplay.com.br/ativar-impressao'; foreach($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))){ $s=$w.CreateShortcut($d + '\Fome Play Pedidos.lnk'); $s.TargetPath=$env:CHROME; $s.Arguments=$a; $s.WorkingDirectory=Split-Path $env:CHROME; $s.IconLocation=$env:CHROME + ',0'; $s.Description='Fome Play - pedidos com impressao automatica'; $s.Save() }"
if errorlevel 1 goto falha

echo.
echo Pronto! A impressao automatica esta configurada.
echo.
echo  - O atalho "Fome Play Pedidos" foi criado na area de trabalho.
echo  - Ele tambem abre sozinho quando o computador ligar.
echo  - Vai abrir uma janela do Fome Play: entre com o e-mail e a senha
echo    do restaurante. Deixe essa janela aberta (pode minimizar).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process ([Environment]::GetFolderPath('Desktop') + '\Fome Play Pedidos.lnk')"
pause
exit /b 0

:numeroinvalido
echo.
echo Numero invalido. Digite um numero da lista.
goto escolher

:semchrome
echo.
echo Nao encontrei o Google Chrome neste computador.
echo Instale o Chrome e de dois cliques neste arquivo de novo.
pause
exit /b 1

:semimpressora
echo.
echo Nao encontrei nenhuma impressora instalada.
echo Instale a impressora termica no Windows e de dois cliques neste arquivo de novo.
pause
exit /b 1

:falha
echo.
echo Algo deu errado e nao consegui terminar. Feche esta janela e tente de novo.
pause
exit /b 1
