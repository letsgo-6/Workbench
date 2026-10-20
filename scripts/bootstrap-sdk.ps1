$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '10.0.26100.9169'
foreach ($package in @('microsoft.windows.sdk.cpp', 'microsoft.windows.sdk.cpp.x64')) {
    $folder = Join-Path $projectRoot ".toolchain\$package"
    if (Test-Path $folder) { continue }
    New-Item -ItemType Directory -Force (Join-Path $projectRoot '.toolchain') | Out-Null
    $archive = Join-Path $projectRoot ".toolchain\$package.zip"
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/$package/$version/$package.$version.nupkg" -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $folder
}
