# Fome Play - impressao automatica dos pedidos (Windows).
# Escolhe a impressora termica como padrao e cria o atalho "Fome Play Pedidos"
# (area de trabalho + Inicializar). O atalho abre o Chrome num perfil separado
# com --kiosk-printing: imprime direto na impressora padrao, sem janela.
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Fome Play - impressao automatica'

function Fim($msg) {
  Write-Host ''
  Write-Host $msg
  Write-Host ''
  Read-Host 'Aperte Enter para fechar'
  exit
}

try {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $chrome) { Fim 'Nao encontrei o Google Chrome. Instale o Chrome e rode o comando de novo.' }

  $printers = @(Get-CimInstance Win32_Printer | Sort-Object Name)
  if ($printers.Count -eq 0) { Fim 'Nao encontrei nenhuma impressora. Instale a impressora termica no Windows e rode o comando de novo.' }

  Write-Host ''
  Write-Host 'Impressoras instaladas neste computador:'
  Write-Host ''
  for ($i = 0; $i -lt $printers.Count; $i++) { Write-Host ('  ' + ($i + 1) + ' - ' + $printers[$i].Name) }
  Write-Host ''

  $n = 0
  while ($true) {
    $answer = Read-Host 'Digite o numero da impressora termica e aperte Enter'
    if ([int]::TryParse($answer, [ref]$n) -and $n -ge 1 -and $n -le $printers.Count) { break }
    Write-Host 'Numero invalido. Digite um numero da lista.'
  }
  $printer = $printers[$n - 1]

  Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows' -Name LegacyDefaultPrinterMode -Type DWord -Value 1
  $result = Invoke-CimMethod -InputObject $printer -MethodName SetDefaultPrinter
  if ($result.ReturnValue -ne 0) { Fim 'Nao consegui definir a impressora padrao. Defina pelo Windows e rode o comando de novo.' }
  Write-Host ('Impressora padrao: ' + $printer.Name)

  $profileDir = Join-Path $env:LocalAppData 'FomePlayPedidos'
  $arguments = '--user-data-dir="' + $profileDir + '" --kiosk-printing --no-first-run --new-window https://fomeplay.com.br/ativar-impressao'
  $shell = New-Object -ComObject WScript.Shell
  $desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Fome Play Pedidos.lnk'
  $startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Fome Play Pedidos.lnk'
  foreach ($path in @($desktopLink, $startupLink)) {
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = $chrome
    $link.Arguments = $arguments
    $link.WorkingDirectory = Split-Path $chrome
    $link.IconLocation = $chrome + ',0'
    $link.Description = 'Fome Play - pedidos com impressao automatica'
    $link.Save()
  }

  Write-Host ''
  Write-Host 'Pronto! A impressao automatica esta configurada.'
  Write-Host ' - O atalho "Fome Play Pedidos" foi criado na area de trabalho.'
  Write-Host ' - Ele tambem abre sozinho quando o computador ligar.'
  Write-Host ' - Vai abrir uma janela do Fome Play: entre com o e-mail e a senha'
  Write-Host '   do restaurante. Deixe essa janela aberta (pode minimizar).'
  Start-Process $desktopLink
  Fim 'Tudo certo.'
} catch {
  Fim ('Algo deu errado: ' + $_.Exception.Message)
}
