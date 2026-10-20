$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$msvcRoot = Get-ChildItem (Join-Path $visualStudio 'VC\Tools\MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$sdkHeaders = Join-Path $projectRoot '.toolchain\microsoft.windows.sdk.cpp\c'
$sdkLibraries = Join-Path $projectRoot '.toolchain\microsoft.windows.sdk.cpp.x64\c'
if (Test-Path $sdkHeaders) {
    $sdkVersion = (Get-ChildItem (Join-Path $sdkHeaders 'Include') -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $env:PATH = "$($msvcRoot.FullName)\bin\Hostx64\x64;$sdkHeaders\bin\$sdkVersion\x64;$env:PATH"
    $env:LIB = "$($msvcRoot.FullName)\lib\x64;$sdkLibraries\um\x64;$sdkLibraries\ucrt\x64"
    $env:INCLUDE = "$($msvcRoot.FullName)\include;$sdkHeaders\Include\$sdkVersion\ucrt;$sdkHeaders\Include\$sdkVersion\shared;$sdkHeaders\Include\$sdkVersion\um;$sdkHeaders\Include\$sdkVersion\winrt"
    $env:WindowsSdkDir = "$sdkHeaders\"
    $env:WindowsSDKVersion = "$sdkVersion\"
} else {
    & (Join-Path $visualStudio 'Common7\Tools\Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
}
