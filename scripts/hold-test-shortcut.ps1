# Test-owned registration; process termination releases it without changing system settings.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WorkbenchTestHotkey {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterHotKey(IntPtr window, int id, uint modifiers, uint key);
}
'@
if ([WorkbenchTestHotkey]::RegisterHotKey([IntPtr]::Zero, 4289, 0x4003, 0x7B)) {
    [Console]::WriteLine('READY')
    [Console]::Out.Flush()
    [Console]::ReadLine() | Out-Null
} else {
    [Console]::WriteLine('UNAVAILABLE')
}
