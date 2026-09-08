# Build Karat DLL on Windows - PowerShell
param(
    [string]$Target = "x86_64-pc-windows-msvc",
    [switch]$Release
)

$ErrorActionPreference = "Stop"

Write-Host "=== Karat DLL Build ===" -ForegroundColor Cyan
Write-Host "Target: $Target"

Push-Location $PSScriptRoot/..

if ($Release) {
    cargo build --release --lib --target $Target
    $out = "target/$Target/release"
} else {
    cargo build --lib --target $Target
    $out = "target/$Target/debug"
}

if ($Target -eq "x86_64-pc-windows-msvc") {
    $out = "target/release"
    if (-not $Release) { $out = "target/debug" }
}

Write-Host "`nBuild output in: $out" -ForegroundColor Green
Get-ChildItem "$out/karat.*" | Format-Table Name, Length, LastWriteTime

# Copy to dist
New-Item -ItemType Directory -Force -Path dist | Out-Null
Copy-Item "$out/karat.dll" dist/ -Force -ErrorAction SilentlyContinue
Copy-Item "$out/karat.lib" dist/ -Force -ErrorAction SilentlyContinue
Copy-Item "$out/karat.dll.lib" dist/ -Force -ErrorAction SilentlyContinue

Write-Host "`nDLL ready in ./dist/" -ForegroundColor Green
Write-Host "Use: examples/test_dll.cs or test_dll.py to test"

Pop-Location
