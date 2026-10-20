param([Parameter(Mandatory = $true)][int]$WorkbenchProcessId)
$testProcess = Get-Process -Id $WorkbenchProcessId -ErrorAction Stop
if ($testProcess.ProcessName -ne 'workbench' -or $testProcess.MainWindowHandle -eq [IntPtr]::Zero) { throw 'Expected the test-owned visible Workbench process' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WorkbenchTestClose {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
if (-not [WorkbenchTestClose]::PostMessage($testProcess.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) { throw 'Could not post close request' }
