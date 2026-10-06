param([Parameter(Mandatory=$true)][string]$Binary, [string]$Output = '.artifacts/windows-performance.json')
$ErrorActionPreference = 'Stop'
$taskBinary = (Resolve-Path -LiteralPath $Binary).Path
$taskWatch = [Diagnostics.Stopwatch]::StartNew()
$taskProcess = Start-Process -FilePath $taskBinary -WindowStyle Hidden -PassThru
try {
  do {
    Start-Sleep -Milliseconds 25
    $taskProcess.Refresh()
    if ($taskProcess.HasExited) { throw 'Application exited during startup' }
  } while ($taskProcess.MainWindowHandle -eq 0 -and $taskWatch.ElapsedMilliseconds -lt 15000)
  if ($taskProcess.MainWindowHandle -eq 0) { throw 'No application window within 15 seconds' }
  $taskWindowMs = $taskWatch.ElapsedMilliseconds
  Start-Sleep -Seconds 5
  $taskProcesses = Get-CimInstance Win32_Process
  $taskIds = [System.Collections.Generic.HashSet[uint32]]::new()
  [void]$taskIds.Add($taskProcess.Id)
  do {
    $taskPreviousCount = $taskIds.Count
    foreach ($taskChild in $taskProcesses) {
      if ($taskIds.Contains($taskChild.ParentProcessId)) { [void]$taskIds.Add($taskChild.ProcessId) }
    }
  } while ($taskPreviousCount -ne $taskIds.Count)
  $taskStats = @(foreach ($taskId in $taskIds) { Get-Process -Id $taskId -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64 })
  $taskResult = [ordered]@{
    binary = $taskBinary
    windowReadyMs = $taskWindowMs
    sampledAfterSeconds = 5
    totalWorkingSetBytes = ($taskStats | Measure-Object WorkingSet64 -Sum).Sum
    processes = $taskStats
    note = 'Window creation timing; not first-paint timing. Working sets include shared pages and WebView descendants.'
  }
  $taskResult | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath $Output
  $taskResult | ConvertTo-Json -Depth 5
} finally {
  if (!$taskProcess.HasExited) { Stop-Process -Id $taskProcess.Id }
}
