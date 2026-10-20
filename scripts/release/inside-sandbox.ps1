# Runs inside a fresh Windows Sandbox (scripts/release/clean-machine.mjs). Nothing but the installer
# is available: no Node, no network, no GPU driver. Each step's result goes to out\report.txt.
$ErrorActionPreference = "Continue"
$desk = "C:\Users\WDAGUtilityAccount\Desktop"
$out = "$desk\out"
$report = "$out\report.txt"
function Step($name, $ok, $detail) {
  $mark = if ($ok) { "PASS" } else { "FAIL" }
  Add-Content -Path $report -Value "$mark  $name  $detail" -Encoding utf8
}
Set-Content -Path $report -Value "Himawari clean-machine test, $(Get-Date -Format s)`nWindows: $((Get-CimInstance Win32_OperatingSystem).Caption) $([Environment]::OSVersion.Version)`n" -Encoding utf8

# 1. Install for this user, silently (the same installer people run with its wizard).
$p = Start-Process -FilePath "$desk\in\setup.exe" -ArgumentList "/S" -Wait -PassThru
Step "install (per user, no admin)" ($p.ExitCode -eq 0) "exit $($p.ExitCode)"

$tools = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs" -Recurse -Filter "himawari-tools.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$studio = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs" -Recurse -Filter "Himawari Studio.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
Step "Studio installed" ($null -ne $studio) "$($studio.FullName)"
Step "tools installed" ($null -ne $tools) "$($tools.FullName)"
Step "no Node on this machine" ($null -eq (Get-Command node -ErrorAction SilentlyContinue)) ""

# 2. Build a sample game with only the installed tools.
$resources = Split-Path (Split-Path $tools.FullName)
$game = "$desk\Festival Eve"
Copy-Item -Recurse "$resources\examples\festival-eve" $game
Push-Location $game
$build = & $tools.FullName build --release 2>&1 | Out-String
Pop-Location
$exe = Get-ChildItem -Path "$game\build\windows" -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
Step "hwc build --release (no Node)" ($null -ne $exe) ($build -replace "`r?`n", " | ")

# 3. Play it a moment, with no GPU driver (software rendering), from a path with a space.
if ($exe) {
  $g = Start-Process -FilePath $exe.FullName -ArgumentList "--frames", "90", "--screenshot", "`"$out\game.png`"" -Wait -PassThru
  Step "the game runs (double-click equivalent)" (($g.ExitCode -eq 0) -and (Test-Path "$out\game.png")) "exit $($g.ExitCode)"
  $info = (Get-Item $exe.FullName).VersionInfo
  Step "exe shows the game's name" ($info.ProductName -eq "Festival Eve") "$($info.ProductName) $($info.FileVersion) / $($info.Comments)"
}

# 4. Studio starts and stays up.
if ($studio) {
  $s = Start-Process -FilePath $studio.FullName -PassThru
  Start-Sleep -Seconds 12
  Step "Studio starts" (-not $s.HasExited) ""
  if (-not $s.HasExited) { Stop-Process -Id $s.Id -Force }
}
Add-Content -Path $report -Value "`ndone" -Encoding utf8
