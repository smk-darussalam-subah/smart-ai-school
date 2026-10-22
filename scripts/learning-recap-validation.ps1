param([ValidatePattern('^[a-z0-9-]+$')][string]$ReceiptName='final',[switch]$WebOnly)
$ErrorActionPreference='Stop'
$taskRepo=Split-Path -Parent $PSScriptRoot
$taskEvidence=Join-Path (Split-Path -Parent $taskRepo) 'docs/audits/evidence/learning-recap-ui-20261021'
$taskOutput=Join-Path $taskEvidence $ReceiptName
if(Test-Path -LiteralPath $taskOutput){throw 'Existing receipt must be preserved'}
New-Item -ItemType Directory -Path $taskOutput | Out-Null
. (Join-Path $PSScriptRoot 'jp-presensi-native-command.ps1')
$taskPaths=@((Get-Content (Join-Path $taskEvidence 'baseline.json') -Raw | ConvertFrom-Json).files.path)+@((Get-Content (Join-Path $taskEvidence 'additional-baseline.json') -Raw | ConvertFrom-Json).path)+@(
'apps/web/src/lib/learning-recap.ts','apps/web/src/lib/learning-recap-document.ts','apps/web/src/app/dashboard/akademik/learning-recap-actions.ts',
'apps/web/src/app/dashboard/akademik/_components/LearningRecap.tsx','apps/web/src/app/dashboard/akademik/_components/LearningSessionDetail.tsx','apps/web/src/app/dashboard/akademik/_components/learning-recap-ui.tsx',
'apps/web/src/__tests__/learning-recap.test.ts','apps/api/src/__tests__/learning-recap-query.spec.ts',
'scripts/learning-recap-baseline.cjs','scripts/learning-recap-ui-lab.cjs','scripts/learning-recap-validation.ps1','scripts/fixtures/learning-recap-actions.ts','scripts/fixtures/learning-recap-ui-lab.tsx','docs/operations/LEARNING-RECAP-WORKFLOW.md')
$taskPaths=[string[]]@($taskPaths | Select-Object -Unique)
[Array]::Sort($taskPaths,[StringComparer]::Ordinal)
function Get-TaskSource { @($taskPaths|ForEach-Object{[PSCustomObject]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $taskRepo $_)).Hash.ToLowerInvariant()}}) }
$taskResults=@()
function Invoke-Check([string]$Name,[string]$Executable,[string[]]$Arguments){
 $taskExit=Invoke-JpPresensiNativeCommand -FilePath $Executable -ArgumentList $Arguments -OutputPath (Join-Path $taskOutput ($Name+'.log'))
 $script:taskResults += [PSCustomObject]@{name=$Name;exitCode=$taskExit}
 $script:taskResults | ConvertTo-Json | Set-Content (Join-Path $taskOutput 'checks.json') -Encoding utf8
 Write-Output "$Name exit=$taskExit"
}
$taskContainer='diis-learning-recap-20261021';$taskOwner='learning-recap-ui-20261021';$taskCreated=$false
$taskSavedDatabase=$env:DATABASE_URL;$taskSavedProof=$env:SESSION_LIFECYCLE_PROOF_DATABASE_URL
Push-Location -LiteralPath $taskRepo
try {
 $taskBefore=Get-TaskSource
 $taskBefore|ConvertTo-Json -Depth 4|Set-Content (Join-Path $taskOutput 'source-before.json') -Encoding utf8
 if($WebOnly){
   $taskPrior=Get-Content (Join-Path $taskEvidence 'final/source-after.json') -Raw|ConvertFrom-Json
   foreach($taskItem in @($taskBefore|Where-Object {$_.path.StartsWith('apps/api/') -or $_.path.StartsWith('packages/')})){
     $taskMatch=@($taskPrior|Where-Object path -CEQ $taskItem.path)
     if($taskMatch.Count -ne 1 -or $taskMatch[0].sha256 -cne $taskItem.sha256){throw 'Backend source changed; full validation required'}
   }
   [PSCustomObject]@{backendByteIdentical=$true;reusedReceipt='final';reason='Frontend and local harness follow-up only; every backend/package hash matches the reused receipt'}|ConvertTo-Json|Set-Content (Join-Path $taskOutput 'backend-preservation.json') -Encoding utf8
 }
 if(-not $WebOnly){
 if(docker ps -a --filter "name=^/$taskContainer`$" --format '{{.Names}}'){throw 'Owned container already exists'}
 docker run -d --name $taskContainer --label "diis.proof=$taskOwner" -p 127.0.0.1:55439:5432 -e POSTGRES_USER=diis_local -e POSTGRES_PASSWORD=diis_local -e POSTGRES_DB=diis_session_activation_wave pgvector/pgvector:pg16
 if($LASTEXITCODE -ne 0){throw 'Disposable DB creation failed'}
 $taskCreated=$true
 for($taskAttempt=0;$taskAttempt -lt 40;$taskAttempt++){docker exec $taskContainer pg_isready -U diis_local|Out-Null;if($LASTEXITCODE -eq 0){break};Start-Sleep -Milliseconds 500}
 $env:DATABASE_URL='postgresql://diis_local:diis_local@127.0.0.1:55439/diis_session_activation_wave';$env:SESSION_LIFECYCLE_PROOF_DATABASE_URL=$env:DATABASE_URL
 Invoke-Check 'migrations' 'npx.cmd' @('--no-install','prisma','migrate','deploy','--schema','packages/database/prisma/schema.prisma')
 if($taskResults[-1].exitCode -ne 0){throw 'Existing migrations failed'}
 Invoke-Check 'postgres' 'npm.cmd' @('test','--workspace=@smk/api','--','--runInBand','--runTestsByPath','src/__tests__/class-session-lifecycle-postgres.spec.ts','--json',('--outputFile='+(Join-Path $taskOutput 'postgres.json')))
 }
} finally {
 $env:DATABASE_URL=$taskSavedDatabase;$env:SESSION_LIFECYCLE_PROOF_DATABASE_URL=$taskSavedProof
 if($taskCreated){$taskInspect=docker inspect $taskContainer|ConvertFrom-Json;if($LASTEXITCODE -ne 0 -or $taskInspect[0].Name -ne ('/'+$taskContainer) -or $taskInspect[0].Config.Labels.'diis.proof' -ne $taskOwner){throw 'Cleanup ownership mismatch'};docker rm -f $taskContainer;if($LASTEXITCODE -ne 0){throw 'Cleanup failed'};[PSCustomObject]@{remaining=@(docker ps -a --filter "name=^/$taskContainer`$" --format '{{.Names}}').Count}|ConvertTo-Json|Set-Content (Join-Path $taskOutput 'cleanup.json') -Encoding utf8}
 Pop-Location
}
Push-Location -LiteralPath $taskRepo
try {
 if(-not $WebOnly){Invoke-Check 'api-full' 'npm.cmd' @('test','--workspace=@smk/api','--','--runInBand','--json',('--outputFile='+(Join-Path $taskOutput 'api-full.json')))}
 Invoke-Check 'web-full' 'npm.cmd' @('test','--workspace=@smk/web','--','--runInBand','--json',('--outputFile='+(Join-Path $taskOutput 'web-full.json')))
 $taskWorkspaces=if($WebOnly){@('web')}else{@('api','web')}
 foreach($taskWorkspace in $taskWorkspaces){
   foreach($taskCheck in @('type-check','lint','build')){Invoke-Check "$taskWorkspace-$taskCheck" 'npm.cmd' @('run',$taskCheck,"--workspace=@smk/$taskWorkspace")}
 }
 $taskAfter=Get-TaskSource
 if(($taskBefore|ConvertTo-Json -Compress) -cne ($taskAfter|ConvertTo-Json -Compress)){throw 'Source changed during validation'}
 $taskAfter|ConvertTo-Json -Depth 4|Set-Content (Join-Path $taskOutput 'source-after.json') -Encoding utf8
 if(@($taskResults|Where-Object exitCode -ne 0).Count){throw 'Validation failed; inspect receipts'}
} finally {Pop-Location}
