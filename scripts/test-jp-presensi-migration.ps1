param([string]$Repository = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$fixtureContainer = 'diis-jp-presensi-proof-20261006'
$fixtureDescription = docker inspect $fixtureContainer | ConvertFrom-Json
$fixtureBinding = $fixtureDescription[0].NetworkSettings.Ports.'5432/tcp'[0]
if ($LASTEXITCODE -ne 0 -or $fixtureBinding.HostPort -ne '55439' -or $fixtureBinding.HostIp -ne '127.0.0.1') { throw 'Dedicated local proof container unavailable' }
$fixtureDatabase = 'diis_jp_presensi_legacy_' + (Get-Date -Format 'yyyyMMddHHmmss')
docker exec $fixtureContainer createdb -U diis_local $fixtureDatabase
if ($LASTEXITCODE -ne 0) { throw 'Cannot create fresh disposable migration proof database' }
function Invoke-ProofSql([string]$Path) {
  Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | docker exec -i $fixtureContainer psql -X -q --single-transaction -v ON_ERROR_STOP=1 -U diis_local -d $fixtureDatabase
  if ($LASTEXITCODE -ne 0) { throw ('SQL proof failed: ' + $Path) }
}
Push-Location -LiteralPath $Repository
try {
  $migrationFiles = @(rg --files packages/database/prisma/migrations -g migration.sql | Sort-Object)
  $legacyFixtureInserted = $false
  foreach ($migrationFile in $migrationFiles) {
    if (-not $legacyFixtureInserted -and $migrationFile -match '20261006000001_daily_jp_staff_attendance') {
      Invoke-ProofSql 'scripts/fixtures/jp-presensi-legacy-before.sql'
      $legacyFixtureInserted = $true
    }
    Invoke-ProofSql $migrationFile
  }
  if (-not $legacyFixtureInserted) { throw 'Expected migration boundary missing' }
  Invoke-ProofSql 'scripts/fixtures/jp-presensi-legacy-after.sql'
  Write-Output ('PASS: legacy custody, unknown GPS, independent checkout, null historical arrival and principal permissions; database retained: ' + $fixtureDatabase)
} finally { Pop-Location }
