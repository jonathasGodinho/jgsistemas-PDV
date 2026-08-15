# ============================================================
# JG Sistemas - Backup automatico do PostgreSQL (Windows)
# Agende no Agendador de Tarefas (diario, ex.: 02:00).
# Retencao: 7 backups (os mais antigos sao apagados).
# ============================================================

$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$dataDir  = Join-Path $root 'dados'
$backupDir = Join-Path $dataDir 'backups'
$dbName   = 'jg_sistemas'
$dbUser   = 'jgadmin'
$retain   = 7

if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }

$date = Get-Date -Format 'yyyy-MM-dd'
$file = Join-Path $backupDir "jg_sistemas_$date.dump"
$log  = Join-Path $backupDir 'backup.log'

function Write-Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $log -Value $line
    Write-Output $line
}

# Lê DATABASE_URL do .env do backend (evita duplicar credenciais).
$envPath = Join-Path $root 'backend\.env'
if (Test-Path $envPath) {
    $m = [regex]::Match((Get-Content $envPath -Raw), 'postgresql://([^:]+):([^@]+)@([^/]+)/(\w+)')
    if ($m.Success) {
        $dbUser = $m.Groups[1].Value
        $dbName = $m.Groups[4].Value
    }
}

Write-Log "Iniciando backup de $dbName ..."

# Localiza o pg_dump (instalacao padrao do PostgreSQL).
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
        Sort-Object { $_.FullName } -Descending | Select-Object -First 1
    if ($candidate) { $pgDump = $candidate }
}
if (-not $pgDump) {
    Write-Log 'ERRO: pg_dump nao encontrado. Instale o PostgreSQL ou ajuste o PATH.'
    exit 1
}

& $pgDump.Source -U $dbUser -F c -f $file $dbName 2>&1 | ForEach-Object { Write-Log "pg_dump: $_" }
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $file)) {
    Write-Log 'ERRO: falha ao gerar o backup.'
    exit 1
}

$size = [math]::Round((Get-Item $file).Length / 1MB, 2)
Write-Log "Backup OK: $file ($size MB)"

# Retencao: remove os backups mais antigos.
Get-ChildItem $backupDir -Filter 'jg_sistemas_*.dump' |
    Sort-Object Name -Descending |
    Select-Object -Skip $retain |
    ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Log "Removido (retencao): $($_.Name)"
    }

Write-Log 'Backup concluido.'
