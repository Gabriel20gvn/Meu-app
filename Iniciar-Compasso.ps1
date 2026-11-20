param([switch]$RedeLocal)
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
    $containerEnv = @(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $containerName)
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel recuperar a chave do processador.' }
    $savedKey = $containerEnv | Where-Object { $_ -match '^COMPASSO_API_TOKEN=' } | Select-Object -First 1
    if (-not $savedKey -or $savedKey.Substring('COMPASSO_API_TOKEN='.Length).Length -lt 24) {
        Stop-WithMessage 'A chave antiga nao foi encontrada. Abra a pasta original do Compasso, onde esta .env.local.'
    }
    Set-Content -LiteralPath $secretPath -Value $savedKey -Encoding Ascii
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

$url = 'http://localhost:8000'
$hostPort = '127.0.0.1:8000:8000'
if ($RedeLocal) {
    $lanAddresses = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { $_ -match '^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)$' } | Select-Object -Unique)
    if ($lanAddresses.Count -eq 0) { Stop-WithMessage 'Nao encontrei o endereco da rede local. Conecte o PC e o celular ao mesmo Wi-Fi e tente novamente.' }
    $lanAddress = $lanAddresses[0]
    $url = "http://${lanAddress}:8000"
    $hostPort = '0.0.0.0:8000:8000'
}

Write-Host 'Verificando a versao do aplicativo. O Docker reaproveita o que ja esta instalado...'
docker build -f server/Dockerfile -t $imageName .
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'A atualizacao da IA falhou. Confira a conexao com a internet e o espaco livre no PC.' }

if ($existingContainer) {
    $publishedPorts = @(docker port $containerName '8000/tcp')
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel consultar a porta do processador.' }
    $imageId = docker image inspect --format '{{.Id}}' $imageName
    $containerImageId = docker inspect --format '{{.Image}}' $containerName
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel consultar a imagem do processador.' }
    $expectedPort = if ($RedeLocal) { '0.0.0.0:8000' } else { '127.0.0.1:8000' }
    if ($publishedPorts -notcontains $expectedPort -or $containerImageId -ne $imageId) {
        Write-Host 'Atualizando o acesso. Analises em andamento serao interrompidas.'
        $running = @(docker ps --format '{{.Names}}') -contains $containerName
        if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel consultar o processador antigo.' }
        if ($running) {
            docker stop $containerName | Out-Null
            if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel parar o processador antigo.' }
        }
        docker rm $containerName | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel remover o processador antigo.' }
        $existingContainer = $false
    }
}

if (-not $existingContainer) {
    docker volume create $volumeName | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Nao foi possivel preparar o armazenamento local.' }
    docker run -d --name $containerName -p $hostPort --env-file $secretPath -v "${volumeName}:/data" $imageName | Out-Null
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
        docker exec $containerName python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/health', timeout=2).read()" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $healthy) {
    docker logs --tail 20 $containerName
    Stop-WithMessage 'O servidor nao iniciou dentro do Docker. Verifique o erro acima.'
}

try {
    Set-Clipboard -Value $key
    Write-Host 'Sua chave de acesso foi copiada. Cole-a quando o aplicativo pedir.' -ForegroundColor Green
} catch {
    Write-Host 'Nao foi possivel copiar a chave. Abra .env.local nesta pasta e copie o valor depois de COMPASSO_API_TOKEN=.'
}

Write-Host "Compasso pronto: $url" -ForegroundColor Green
if ($RedeLocal) {
    Write-Host 'No celular, abra o endereco acima. Use o mesmo Wi-Fi do PC e digite sua chave de acesso.'
    Write-Host 'O PC e o Docker Desktop precisam continuar ligados.'
} else {
    Write-Host 'Na tela de conexao, o endereco local ja aparece preenchido. Cole apenas a chave.'
}
Start-Process $url
