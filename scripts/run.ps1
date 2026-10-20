. (Join-Path $PSScriptRoot 'toolchain.ps1')
$taskCommand = $args[0]
$taskArguments = $args | Select-Object -Skip 1
& $taskCommand @taskArguments
exit $LASTEXITCODE
