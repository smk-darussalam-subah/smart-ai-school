param([string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.tasks/evidence/jp-presensi-p2-followup-20261008'))
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'jp-presensi-native-command.ps1')
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$engine = 'ps' + $PSVersionTable.PSVersion.Major
$logPath = Join-Path $OutputDirectory ('native-controls-' + $engine + '.log')
$success = Invoke-JpPresensiNativeCommand -FilePath node.exe -ArgumentList @('-e', 'process.stdout.write(''stdout-ok\n''); process.stderr.write(''PASS synthetic native status\n''); process.exit(0)') -OutputPath $logPath
if ($success -ne 0) { throw ('False-negative native stderr success: ' + $success) }
$failure = Invoke-JpPresensiNativeCommand -FilePath node.exe -ArgumentList @('-e', 'process.stdout.write(''stdout-failure\n''); process.stderr.write(''FAIL synthetic negative control\n''); process.exit(17)') -OutputPath $logPath -Append
if ($failure -ne 17) { throw ('Native nonzero was not preserved: ' + $failure) }
if ($ErrorActionPreference -ne 'Stop') { throw 'Caller Stop preference leaked' }
$missingDenied = $false
try { Invoke-JpPresensiNativeCommand -FilePath 'diis-proof-missing-command-20261008.exe' -ArgumentList @('unused') -OutputPath $logPath | Out-Null }
catch [System.Management.Automation.CommandNotFoundException] { $missingDenied = $true }
if (-not $missingDenied) { throw 'Missing executable did not fail closed' }
$logFailureDenied = $false
try { Invoke-JpPresensiNativeCommand -FilePath node.exe -ArgumentList @('-e','process.stdout.write(''force-log-write\n''); process.exit(0)') -OutputPath (Join-Path $OutputDirectory 'missing-directory/not-writable.log') | Out-Null }
catch { $logFailureDenied = $true }
if (-not $logFailureDenied) { throw 'Logging failure did not fail closed' }
$log = Get-Content -LiteralPath $logPath -Raw
if ($log -notmatch 'stdout-ok' -or $log -notmatch 'PASS synthetic native status' -or $log -notmatch 'FAIL synthetic negative control') { throw 'Native output capture incomplete' }
[pscustomobject]@{ version = $PSVersionTable.PSVersion.ToString(); successExit = $success; nonzeroExit = $failure; missingExecutableDenied = $missingDenied; loggingFailureDenied = $logFailureDenied; callerPreference = $ErrorActionPreference.ToString() } | ConvertTo-Json | Tee-Object -FilePath (Join-Path $OutputDirectory ('native-controls-' + $engine + '.json'))
