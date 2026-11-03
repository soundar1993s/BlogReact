$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectPath '.env'
if (Test-Path -LiteralPath $envPath) { throw '.env already exists; keep the existing credentials or rotate them deliberately.' }
function New-RandomSecret {
    $secretBytes = New-Object byte[] 48
    $secretGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $secretGenerator.GetBytes($secretBytes) } finally { $secretGenerator.Dispose() }
    return [Convert]::ToBase64String($secretBytes)
}
$secretContent = "DB_PASSWORD=$(New-RandomSecret)`nMYSQL_ROOT_PASSWORD=$(New-RandomSecret)`nJWT_SECRET=$(New-RandomSecret)`n"
[System.IO.File]::WriteAllText($envPath, $secretContent, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Created ignored .env with random local credentials. Run docker compose up --build -d.'
