# Supported on Windows PowerShell 5.1 and PowerShell 7. No shell command strings.
function Invoke-JpPresensiNativeCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [switch]$Append
  )
  $nativePath = (Get-Command -Name $FilePath -CommandType Application,ExternalScript -ErrorAction Stop | Select-Object -First 1).Source
  # Only native capture relaxes ErrorRecord handling, in an isolated child scope.
  # PS5 wraps stderr in NativeCommandError even for exit 0 (e.g. Jest PASS).
  $nativeResult = & {
    $ErrorActionPreference = 'Continue'
    $PSNativeCommandUseErrorActionPreference = $false
    # Native invocation updates global LASTEXITCODE; a local sentinel shadows it.
    $global:LASTEXITCODE = -1
    $nativeLines = @(& $nativePath @ArgumentList 2>&1 | ForEach-Object { $_.ToString() })
    [pscustomobject]@{ Lines = $nativeLines; ExitCode = $global:LASTEXITCODE }
  }
  # File/log errors still stop. Do not weaken the caller's ErrorActionPreference.
  if ($Append) {
    $nativeResult.Lines | Tee-Object -FilePath $OutputPath -Append -ErrorAction Stop | ForEach-Object { Write-Host $_ }
  } else {
    $nativeResult.Lines | Tee-Object -FilePath $OutputPath -ErrorAction Stop | ForEach-Object { Write-Host $_ }
  }
  return [int]$nativeResult.ExitCode
}
