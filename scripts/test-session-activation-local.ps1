param([string]$Repository = (Split-Path -Parent $PSScriptRoot), [switch]$IncludeRegression)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jp-presensi-native-command.ps1')
$taskContainer = 'diis-session-activation-wave-20261020'
$taskOwner = 'session-activation-wave-20261020'
if (docker ps -a --filter "name=^/$taskContainer`$" --format '{{.Names}}') { throw 'Existing proof container must not be reused' }
$taskSavedDatabase = $env:DATABASE_URL
$taskSavedProof = $env:SESSION_LIFECYCLE_PROOF_DATABASE_URL
$taskSavedJp = $env:JP_ATTENDANCE_PROOF_DATABASE_URL
$taskSavedClock = $env:JP_PROOF_CLOCK_DATE
$taskSavedWave = $env:WAVE85_DATABASE_URL
$taskOutput = Join-Path $Repository '.tasks/evidence/session-activation-wave-20261020'
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskCreated = $false
Push-Location -LiteralPath $Repository
try {
  $taskSourcePaths=@(
    'packages/database/prisma/schema.prisma',
    'packages/database/prisma/migrations/20261020000001_class_session_activation/migration.sql',
    'apps/api/src/common/helpers/class-session-activation.ts',
    'apps/api/src/common/helpers/class-session-notification.ts',
    'apps/api/src/common/helpers/operational-teacher.ts',
    'apps/api/src/class-sessions/class-session.service.ts',
    'apps/api/src/class-sessions/class-session-due.service.ts',
    'apps/api/src/class-sessions/class-session.controller.ts',
    'apps/api/src/class-sessions/class-session.dto.ts',
    'apps/api/src/operational-monitoring/operational-monitoring.service.ts',
    'apps/api/src/notification/notification-worker.ts',
    'apps/api/src/push/push.service.ts',
    'apps/api/src/staff-attendance/staff-attendance.service.ts',
    'apps/api/src/__tests__/class-session-lifecycle-postgres.spec.ts',
    'apps/api/src/__tests__/daily-jp-attendance-postgres.spec.ts',
    'apps/api/src/__tests__/wave8-5-postgres-proof.spec.ts',
    'scripts/test-session-activation-local.ps1'
  )
  $taskSourceBefore=@($taskSourcePaths | ForEach-Object { [PSCustomObject]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $Repository $_) -Algorithm SHA256).Hash.ToLowerInvariant()} })
  $taskSourceBefore | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskOutput 'proof-source-before.json') -Encoding UTF8
  docker run -d --name $taskContainer --label "diis.proof=$taskOwner" -p 127.0.0.1:55439:5432 -e POSTGRES_USER=diis_local -e POSTGRES_PASSWORD=diis_local -e POSTGRES_DB=diis_session_activation_wave pgvector/pgvector:pg16
  if ($LASTEXITCODE -ne 0) { throw 'Cannot start dedicated loopback proof database' }
  $taskCreated = $true
  for ($taskAttempt=0; $taskAttempt -lt 40; $taskAttempt++) {
    docker exec $taskContainer pg_isready -U diis_local | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
  $env:DATABASE_URL='postgresql://diis_local:diis_local@127.0.0.1:55439/diis_session_activation_wave'
  $env:SESSION_LIFECYCLE_PROOF_DATABASE_URL=$env:DATABASE_URL
  $taskCode=Invoke-JpPresensiNativeCommand -FilePath npx.cmd -ArgumentList @('prisma','migrate','deploy','--schema','packages/database/prisma/schema.prisma') -OutputPath (Join-Path $taskOutput 'migration.log')
  if ($taskCode -ne 0) { throw 'Migration failed' }
  $taskCode=Invoke-JpPresensiNativeCommand -FilePath npm.cmd -ArgumentList @('test','--workspace=@smk/api','--','--runInBand','--runTestsByPath','src/__tests__/class-session-lifecycle-postgres.spec.ts','--json',('--outputFile='+(Join-Path $taskOutput 'postgres-tests.json'))) -OutputPath (Join-Path $taskOutput 'postgres-tests.log')
  if ($taskCode -ne 0) { throw 'Proof failed' }
  if ($IncludeRegression) {
    foreach ($taskDate in @('2026-10-06','2026-10-13','wave85')) {
      $taskDatabase=if ($taskDate -eq 'wave85') { 'diis_wave85_activation' } else { 'diis_jp_presensi_activation_'+$taskDate.Replace('-','') }
      docker exec $taskContainer createdb -U diis_local $taskDatabase
      if ($LASTEXITCODE -ne 0) { throw 'Cannot create fresh regression database' }
      $env:DATABASE_URL='postgresql://diis_local:diis_local@127.0.0.1:55439/'+$taskDatabase
      $taskCode=Invoke-JpPresensiNativeCommand -FilePath npx.cmd -ArgumentList @('prisma','migrate','deploy','--schema','packages/database/prisma/schema.prisma') -OutputPath (Join-Path $taskOutput ("migration-$taskDate.log"))
      if ($taskCode -ne 0) { throw 'Regression migration failed' }
      if ($taskDate -eq 'wave85') { $env:WAVE85_DATABASE_URL=$env:DATABASE_URL; $env:JP_ATTENDANCE_PROOF_DATABASE_URL=$null; $taskSpec='wave8-5-postgres-proof.spec.ts' }
      else { $env:JP_ATTENDANCE_PROOF_DATABASE_URL=$env:DATABASE_URL; $env:JP_PROOF_CLOCK_DATE=$taskDate; $taskSpec='daily-jp-attendance-postgres.spec.ts' }
      $taskCode=Invoke-JpPresensiNativeCommand -FilePath npm.cmd -ArgumentList @('test','--workspace=@smk/api','--','--runInBand','--runTestsByPath',("src/__tests__/$taskSpec"),'--json',('--outputFile='+(Join-Path $taskOutput ("regression-$taskDate.json")))) -OutputPath (Join-Path $taskOutput ("regression-$taskDate.log"))
      if ($taskCode -ne 0) { throw 'Regression proof failed' }
    }
  }
  $taskSourceAfter=@($taskSourcePaths | ForEach-Object { [PSCustomObject]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $Repository $_) -Algorithm SHA256).Hash.ToLowerInvariant()} })
  if (($taskSourceBefore | ConvertTo-Json -Compress) -ne ($taskSourceAfter | ConvertTo-Json -Compress)) { throw 'Source changed during proof' }
  [PSCustomObject]@{sameSource=$true;count=$taskSourceAfter.Count;files=$taskSourceAfter} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskOutput 'proof-source-after.json') -Encoding UTF8
} finally {
  $env:DATABASE_URL=$taskSavedDatabase
  $env:SESSION_LIFECYCLE_PROOF_DATABASE_URL=$taskSavedProof
  $env:JP_ATTENDANCE_PROOF_DATABASE_URL=$taskSavedJp
  $env:JP_PROOF_CLOCK_DATE=$taskSavedClock
  $env:WAVE85_DATABASE_URL=$taskSavedWave
  if ($taskCreated) {
    $taskInspect=docker inspect $taskContainer | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $taskInspect[0].Name -ne ('/'+$taskContainer) -or $taskInspect[0].Config.Labels.'diis.proof' -ne $taskOwner) { throw 'Ownership mismatch; cleanup stopped' }
    docker rm -f $taskContainer
    if ($LASTEXITCODE -ne 0) { throw 'Owned container cleanup failed' }
  }
  Pop-Location
}
