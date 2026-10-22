param([string]$Repository = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jp-presensi-native-command.ps1')
$container = 'diis-dashboard-proof-20261020'
$label = 'diis.proof=dashboard-sessions-20261020'
if (docker ps -a --filter "name=^/$container`$" --format '{{.Names}}') { throw 'Proof container already exists; do not reuse it.' }
$savedDatabase = $env:DATABASE_URL
$savedProof = $env:JP_ATTENDANCE_PROOF_DATABASE_URL
$savedClock = $env:JP_PROOF_CLOCK_DATE
$out = Join-Path $Repository '.tasks/evidence/dashboard-sessions-20261020'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$created = $false
Push-Location -LiteralPath $Repository
try {
  docker run -d --name $container --label $label -p 127.0.0.1:55439:5432 -e POSTGRES_USER=diis_local -e POSTGRES_PASSWORD=diis_local pgvector/pgvector:pg16
  if ($LASTEXITCODE -ne 0) { throw 'Cannot start isolated loopback-only proof PostgreSQL' }
  $created = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    docker exec $container pg_isready -U diis_local | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Proof database unavailable' }
  foreach ($date in @('2026-10-06', '2026-10-13')) {
    $database = 'diis_jp_presensi_dashboard_' + $date.Replace('-', '')
    docker exec $container createdb -U diis_local $database
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create fresh proof database' }
    $env:DATABASE_URL = 'postgresql://diis_local:diis_local@127.0.0.1:55439/' + $database
    $env:JP_ATTENDANCE_PROOF_DATABASE_URL = $env:DATABASE_URL
    $env:JP_PROOF_CLOCK_DATE = $date
    $output = Join-Path $out ('postgres-' + $date + '.log')
    $code = Invoke-JpPresensiNativeCommand -FilePath npx.cmd -ArgumentList @('prisma','migrate','deploy','--schema','packages/database/prisma/schema.prisma') -OutputPath $output
    if ($code -ne 0) { throw "Proof migration failed: $code" }
    $code = Invoke-JpPresensiNativeCommand -FilePath npm.cmd -ArgumentList @('test','--workspace=@smk/api','--','--runInBand','--runTestsByPath','src/__tests__/daily-jp-attendance-postgres.spec.ts') -OutputPath $output -Append
    if ($code -ne 0) { throw "Proof tests failed: $code" }
  }
} finally {
  $env:DATABASE_URL = $savedDatabase
  $env:JP_ATTENDANCE_PROOF_DATABASE_URL = $savedProof
  $env:JP_PROOF_CLOCK_DATE = $savedClock
  if ($created) {
    $owner = docker inspect $container --format '{{index .Config.Labels "diis.proof"}}'
    if ($LASTEXITCODE -ne 0 -or $owner -ne 'dashboard-sessions-20261020') { throw 'Container ownership mismatch; cleanup stopped' }
    docker rm -f $container
    if ($LASTEXITCODE -ne 0) { throw 'Proof container cleanup failed' }
  }
  Pop-Location
}
