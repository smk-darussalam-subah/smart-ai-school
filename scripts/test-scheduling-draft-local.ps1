param(
  [string]$Repository = (Split-Path -Parent $PSScriptRoot),
  [ValidateSet('2026-10-06','2026-10-13')][string]$FixtureDate = '2026-10-06',
  [string]$ContainerName = 'diis-wave1a-proof-20261008',
  [int]$Port = 55441,
  [string]$DatabasePrefix = 'diis_wave1a_',
  [string]$ConnectionString = '',
  [switch]$ValidateTargetOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jp-presensi-native-command.ps1')
# No caller-supplied database target, legacy container, external host or .env fallback.
if ($ContainerName -cne 'diis-wave1a-proof-20261008' -or $Port -ne 55441 -or
    $DatabasePrefix -cne 'diis_wave1a_' -or $ConnectionString -ne '') {
  throw 'Only the exact Wave 1A disposable target is allowed'
}
if ($env:DATABASE_URL -and $env:DATABASE_URL -notmatch '^postgresql://wave1a_local:wave1a_local@127\.0\.0\.1:55441/diis_wave1a_[a-z0-9_]+$') {
  throw 'Ambient/default database URL refused; use an isolated child process'
}
$repoPath = (Resolve-Path -LiteralPath $Repository).Path
if ($repoPath -cne 'C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school-jp-presensi-20261006') {
  throw 'Runner must bind the approved Wave 1A checkout'
}
if ($ValidateTargetOnly) { Write-Output 'Wave 1A target policy accepted; no database created'; exit 0 }
$contractPath = Join-Path $repoPath '.tasks/evidence/smart-scheduling-wave1a-contract-20261008/contract.json'
if ((Get-FileHash -LiteralPath $contractPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne
    'f3bfad23ac482d409dbd14845544fbe479ce89302f559291d64b2adbf5c2277b') { throw 'Approved contract bytes changed' }
$contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
$codePaths = [string[]]@($contract.proposedFiles | Where-Object { $_.path -ne 'docs/scheduling/WAVE1A_IMPLEMENTATION_REPORT.md' } | ForEach-Object { $_.path })
[Array]::Sort($codePaths, [StringComparer]::Ordinal)
$codeBefore = @(foreach ($codePath in $codePaths) {
  [ordered]@{ path=$codePath; sha256=(Get-FileHash -LiteralPath (Join-Path $repoPath $codePath) -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$evidence = Join-Path $repoPath '.tasks/evidence/smart-scheduling-wave1a-implementation-20261008'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$ownershipPath = Join-Path $evidence 'container-ownership.json'
$existingNames = @(docker ps -a --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect local container inventory' }
if ($existingNames -contains $ContainerName) {
  if (-not (Test-Path -LiteralPath $ownershipPath)) { throw 'Pre-existing container has no Wave 1A ownership evidence' }
} else {
  if (Test-Path -LiteralPath $ownershipPath) { throw 'Owned container vanished; do not silently replace its evidence' }
  $imageId = docker image inspect --format '{{.Id}}' 'pgvector/pgvector:pg16'
  if ($LASTEXITCODE -ne 0) { throw 'Existing local PostgreSQL image required; no image pull is performed' }
  $containerId = docker run -d --name $ContainerName --label 'diis.task=smart-scheduling-wave1a-20261008' -p '127.0.0.1:55441:5432' -e 'POSTGRES_USER=wave1a_local' -e 'POSTGRES_PASSWORD=wave1a_local' -e 'POSTGRES_DB=wave1a_bootstrap' $imageId
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create task-owned disposable container' }
  [ordered]@{ containerId=$containerId; imageId=$imageId; task='smart-scheduling-wave1a-20261008' } |
    ConvertTo-Json | Set-Content -LiteralPath $ownershipPath -Encoding UTF8
}
$owned = Get-Content -LiteralPath $ownershipPath -Raw | ConvertFrom-Json
$description = docker inspect $ContainerName | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Wave 1A container' }
$binding = $description[0].NetworkSettings.Ports.'5432/tcp'
if ($description[0].Id -cne $owned.containerId -or $description[0].Image -cne $owned.imageId -or
    $description[0].Config.Labels.'diis.task' -cne 'smart-scheduling-wave1a-20261008' -or
    $binding.Count -ne 1 -or $binding[0].HostIp -cne '127.0.0.1' -or $binding[0].HostPort -cne '55441' -or
    -not $description[0].State.Running) { throw 'Disposable container identity/label/binding changed' }
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  # The image's temporary initialization server is socket-only; require final TCP readiness.
  docker exec $ContainerName pg_isready -h 127.0.0.1 -U wave1a_local -d wave1a_bootstrap | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready=$true; break }
  Start-Sleep -Milliseconds 200
}
if (-not $ready) { throw 'Disposable PostgreSQL did not become ready' }
$database = $DatabasePrefix + (Get-Date -Format 'yyyyMMddHHmmss') + '_' + ([guid]::NewGuid().ToString('N').Substring(0,8))
docker exec $ContainerName createdb -U wave1a_local $database
if ($LASTEXITCODE -ne 0) { throw 'Cannot create fresh disposable database' }
$env:DATABASE_URL = 'postgresql://wave1a_local:wave1a_local@127.0.0.1:55441/' + $database
$env:WAVE1A_PROOF_DATABASE_URL = $env:DATABASE_URL
$env:WAVE1A_PROOF_CLOCK_DATE = $FixtureDate
$env:SMART_SCHEDULER_ENABLED = 'true'
$output = Join-Path $evidence ('postgres-' + $FixtureDate + '-ps' + $PSVersionTable.PSVersion.Major + '-' + $database + '.log')
Push-Location -LiteralPath $repoPath
try {
  $migrationExit = Invoke-JpPresensiNativeCommand -FilePath npx.cmd -ArgumentList @('prisma','migrate','deploy','--schema','packages/database/prisma/schema.prisma') -OutputPath $output
  if ($migrationExit -ne 0) { throw ('Disposable migration failed; native exit ' + $migrationExit) }
  $proofExit = Invoke-JpPresensiNativeCommand -FilePath npm.cmd -ArgumentList @('run','test','--workspace','@smk/api','--','--runInBand','--testPathPattern=scheduling-draft-postgres') -OutputPath $output -Append
  $codeUnchanged = $true
  foreach ($codeFile in $codeBefore) {
    if ((Get-FileHash -LiteralPath (Join-Path $repoPath $codeFile.path) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $codeFile.sha256) { $codeUnchanged=$false }
  }
  [ordered]@{ date=$FixtureDate; engine=$PSVersionTable.PSVersion.ToString(); database=$database;
    migrationExit=$migrationExit; testExit=$proofExit; container=$ContainerName;
    contractSha256='f3bfad23ac482d409dbd14845544fbe479ce89302f559291d64b2adbf5c2277b';
    sourceUnchangedDuringRun=$codeUnchanged; sourceFiles=$codeBefore } |
    ConvertTo-Json | Set-Content -LiteralPath ($output + '.json') -Encoding UTF8
  if (-not $codeUnchanged) { throw 'Source changed during the run; proof is not bound' }
  Write-Output ('Task-owned disposable database retained: ' + $database)
  exit $proofExit
} finally { Pop-Location }
