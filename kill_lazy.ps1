$processes = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*main.py*" }
if ($processes) {
    echo "Found Lazy processes:"
    $processes | ForEach-Object {
        echo "Killing PID: $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force
    }
} else {
    echo "No Lazy process found via WMI."
    # Fallback: kill all python if user approves? No, dangerous.
    # Try finding by window title
    $p = Get-Process | Where-Object { $_.MainWindowTitle -like "*LAZY*" }
    if ($p) {
        echo "Found by Window Title. Killing..."
        $p | Stop-Process -Force
    }
}
