$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmdPath = Join-Path $scriptDir "Run.cmd"

if (-not (Test-Path $cmdPath)) {
    Write-Error "Run.cmd not found: $cmdPath"
    exit 1
}

& $cmdPath @args
exit $LASTEXITCODE
