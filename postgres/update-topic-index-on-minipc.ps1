$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $Utf8
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8
$LogPath = Join-Path $PSScriptRoot ("topic-index-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$PasswordPointer = [IntPtr]::Zero
$ExitCode = 0

function Write-Step([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
  Write-Host $Message -ForegroundColor $Color
  Add-Content -Path $LogPath -Value $Message -Encoding UTF8
}

function Invoke-Npm([string]$Label, [string[]]$Arguments) {
  Write-Step "`n== $Label ==" Cyan
  & npm.cmd @Arguments 2>&1 | ForEach-Object { Write-Host $_; Add-Content -Path $LogPath -Value $_ -Encoding UTF8 }
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

try {
  Set-Content -Path $LogPath -Value ("Topic index update started " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -Encoding UTF8
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  Write-Step "Repository: $RepoRoot"
  foreach ($Command in @('node.exe', 'npm.cmd')) { if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "$Command was not found in PATH." } }
  $SecurePassword = Read-Host 'PostgreSQL workers_vpc password' -AsSecureString
  $PasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
  $env:PGHOST = '127.0.0.1'
  $env:PGPORT = '5432'
  $env:PGUSER = 'workers_vpc'
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPointer)
  $env:PGDATABASE = 'aozora_reader'
  $env:PGSSLMODE = 'require'
  $env:PGSSLMINVERSION = 'TLSv1.3'
  $env:PGSSLREJECTUNAUTHORIZED = 'false'
  Set-Location $RepoRoot
  Invoke-Npm 'Install dependencies' @('install', '--no-audit', '--no-fund')
  Invoke-Npm 'Build topic example index' @('run', 'db:migrate')
  Invoke-Npm 'Refresh topic examples' @('run', 'db:refresh:topics')
  Write-Step "`nTopic example index completed. Log: $LogPath" Green
} catch {
  $ExitCode = 1
  Write-Step "`nTOPIC INDEX UPDATE FAILED: $($_.Exception.Message)" Red
  Write-Step "Log: $LogPath" Yellow
} finally {
  if ($PasswordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer) }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
exit $ExitCode
