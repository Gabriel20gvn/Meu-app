$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Stop-WithMessage([string]$Message) {
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Stop-WithMessage 'Instale e abra o Docker Desktop primeiro: https://www.docker.com/products/docker-desktop/'
}

Write-Host 'Verificando o Docker Desktop...'
try { docker info --format '{{.ServerVersion}}' 2>$null | Out-Null }
catch { Stop-WithMessage 'O Docker Desktop nao esta pronto. Abra-o, aguarde iniciar e tente novamente.' }
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage 'O Docker Desktop nao esta pronto. Abra-o, aguarde iniciar e tente novamente.'
}

$containerName = 'compasso-local'
$imageName = 'compasso-ia-local:latest'
$volumeName = 'compasso-dados'
$secretPath = Join-Path $PSScriptRoot '.env.local'
$existingContainer = @(docker ps -a --format '{{.Names}}') -contains $containerName
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel consultar os containers do Docker.' }

if ($existingContainer -and -not (Test-Path -LiteralPath $secretPath)) {
    Stop-WithMessage 'O processador ja existe, mas a chave .env.local nao esta nesta pasta. Abra a pasta antiga onde voce iniciou o Compasso pela primeira vez.'
}

if (-not (Test-Path -LiteralPath $secretPath)) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Set-Content -LiteralPath $secretPath -Value "COMPASSO_API_TOKEN=$key" -Encoding Ascii
}

$secretLine = Get-Content -LiteralPath $secretPath | Where-Object { $_ -match '^COMPASSO_API_TOKEN=' } | Select-Object -First 1
if (-not $secretLine -or $secretLine.Substring('COMPASSO_API_TOKEN='.Length).Length -lt 24) {
    Stop-WithMessage 'A chave em .env.local esta ausente ou invalida.'
}
$key = $secretLine.Substring('COMPASSO_API_TOKEN='.Length)

if (-not $existingContainer) {
    $images = @(docker images --format '{{.Repository}}:{{.Tag}}')
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel consultar as imagens do Docker.' }
    if ($images -notcontains $imageName) {
        Write-Host 'Preparando a IA. Na primeira vez, o download e a instalacao podem demorar varios minutos...'
        docker build -f server/Dockerfile -t $imageName .
        if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'A instalacao da IA falhou. Confira a conexao com a internet e o espaco livre no PC.' }
    }
    docker volume create $volumeName | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel preparar o armazenamento local.' }
    docker run -d --name $containerName -p '127.0.0.1:8000:8000' --env-file $secretPath -v "${volumeName}:/data" $imageName | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel iniciar o Compasso. Confira se a porta 8000 esta livre.' }
} else {
    $running = @(docker ps --format '{{.Names}}') -contains $containerName
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel consultar o processador.' }
    if (-not $running) {
        docker start $containerName | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel reiniciar o Compasso.' }
    }
}

$healthy = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:8000/api/health' -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (-not $healthy) {
    docker logs --tail 20 $containerName
    Stop-WithMessage 'O servidor nao respondeu em http://localhost:8000. Verifique o erro acima.'
}

try {
    Set-Clipboard -Value $key
    Write-Host 'Sua chave de acesso foi copiada. Cole-a quando o aplicativo pedir.' -ForegroundColor Green
} catch {
    Write-Host 'Nao foi possivel copiar a chave. Abra .env.local nesta pasta e copie o valor depois de COMPASSO_API_TOKEN=.'
}

Write-Host 'Compasso pronto: http://localhost:8000' -ForegroundColor Green
Write-Host 'Na tela de conexao, o endereco local ja aparece preenchido. Cole apenas a chave.'
Start-Process 'http://localhost:8000'
