param([string]$Repository = (Split-Path -Parent $PSScriptRoot), [ValidateSet('2026-10-06','2026-10-13')][string]$FixtureDate = '2026-10-06')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jp-presensi-native-command.ps1')
$fixtureContainer = 'diis-jp-presensi-proof-20261006'
$fixtureDescription = docker inspect $fixtureContainer | ConvertFrom-Json
$fixtureBinding = $fixtureDescription[0].NetworkSettings.Ports.'5432/tcp'[0]
if ($LASTEXITCODE -ne 0 -or $fixtureBinding.HostPort -ne '55439' -or $fixtureBinding.HostIp -ne '127.0.0.1') { throw 'Dedicated local proof container unavailable' }
$fixtureDatabase = 'diis_jp_presensi_' + (Get-Date -Format 'yyyyMMddHHmmss')
docker exec $fixtureContainer createdb -U diis_local $fixtureDatabase
if ($LASTEXITCODE -ne 0) { throw 'Cannot create fresh disposable proof database' }
$env:DATABASE_URL = 'postgresql://diis_local:diis_local@127.0.0.1:55439/' + $fixtureDatabase
$env:JP_ATTENDANCE_PROOF_DATABASE_URL = $env:DATABASE_URL
$env:JP_PROOF_CLOCK_DATE = $FixtureDate
$proofEvidence = Join-Path $Repository '.tasks/evidence/jp-presensi-p2-followup-20261008'
New-Item -ItemType Directory -Path $proofEvidence -Force | Out-Null
Push-Location -LiteralPath $Repository
Start-Transcript -LiteralPath (Join-Path $proofEvidence ('postgres-' + $FixtureDate + '-' + $fixtureDatabase + '.log')) | Out-Null
try {
  $proofOutput = Join-Path $proofEvidence ('postgres-output-' + $FixtureDate + '-' + $fixtureDatabase + '.log')
  $migrationExitCode = Invoke-JpPresensiNativeCommand -FilePath npx.cmd -ArgumentList @('prisma','migrate','deploy','--schema','packages/database/prisma/schema.prisma') -OutputPath $proofOutput
  if ($migrationExitCode -ne 0) { throw ('Fixture migration failed; native exit ' + $migrationExitCode) }
  $proofExitCode = Invoke-JpPresensiNativeCommand -FilePath npm.cmd -ArgumentList @('run','test','--workspace','@smk/api','--','--runInBand','--testPathPattern=daily-jp-attendance') -OutputPath $proofOutput -Append
  Write-Output ('Disposable proof database retained: ' + $fixtureDatabase)
  exit $proofExitCode
} finally { Stop-Transcript | Out-Null; Pop-Location }
