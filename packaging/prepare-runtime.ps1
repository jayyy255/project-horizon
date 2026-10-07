$ErrorActionPreference = 'Stop'
$repoPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stagingPath = [System.IO.Path]::GetFullPath((Join-Path $repoPath 'release/staging'))
if (-not $stagingPath.StartsWith($repoPath + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Invalid staging path.' }
if (Test-Path -LiteralPath $stagingPath) { Remove-Item -LiteralPath $stagingPath -Recurse -Force }
$servicePath = Join-Path $stagingPath 'perception-service'
$runtimePath = Join-Path $servicePath 'runtime'
$nativePath = Join-Path $stagingPath 'native'
$accessPath = Join-Path $stagingPath 'app-access'
New-Item -ItemType Directory -Path $runtimePath,$nativePath,$accessPath -Force | Out-Null
if ($env:HORIZON_BUNDLE_OWNER_KEY -eq '1') {
  $sharedGeminiKey = $env:GEMINI_API_KEY
  if ($sharedGeminiKey -notmatch '^(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,})$') {
    $keyLine = Get-Content -LiteralPath (Join-Path $repoPath '.env') | Where-Object { $_ -match '^\s*GEMINI_API_KEY\s*=' } | Select-Object -Last 1
    if ($keyLine) { $sharedGeminiKey = ($keyLine -split '=',2)[1].Trim().Trim('"').Trim("'") }
  }
  if ($sharedGeminiKey -notmatch '^(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,})$') { throw 'A valid owner Gemini key is required for a friends build.' }
  $accessJson = @{apiKey=$sharedGeminiKey} | ConvertTo-Json -Compress
  [IO.File]::WriteAllText((Join-Path $accessPath 'owner-gemini.json'), $accessJson, [Text.UTF8Encoding]::new($false))
  $sharedGeminiKey = $null
  $accessJson = $null
  Write-Host 'Owner-provided Gemini access prepared for the private friends build.'
}
$cachePath = Join-Path $repoPath 'release/downloads'
New-Item -ItemType Directory -Path $cachePath -Force | Out-Null
$pythonZip = Join-Path $cachePath 'python-3.13.2-embed-amd64.zip'
if (-not (Test-Path -LiteralPath $pythonZip)) {
  Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.2/python-3.13.2-embed-amd64.zip' -OutFile $pythonZip
}
Expand-Archive -LiteralPath $pythonZip -DestinationPath $runtimePath -Force
# The embedded interpreter uses only relative paths and does not need host Python.
[System.IO.File]::WriteAllText((Join-Path $runtimePath 'python313._pth'), "python313.zip`n.`nLib/site-packages`n..`nimport site`n")
$packagesPath = Join-Path $repoPath 'backend/perception-service/.venv/Lib/site-packages'
if (-not (Test-Path -LiteralPath $packagesPath)) { throw 'Create the perception-service .venv and install requirements before packaging.' }
$targetPackages = Join-Path $runtimePath 'Lib/site-packages'
New-Item -ItemType Directory -Path $targetPackages -Force | Out-Null
& robocopy $packagesPath $targetPackages /E /XD __pycache__ .pytest_cache pip setuptools _distutils_hack torch torchvision ultralytics ultralytics_platform ultralytics_thop polars polars_runtime_32 matplotlib /XF '*.pyc' '*.pyo' distutils-precedence.pth /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copying perception dependencies failed: $LASTEXITCODE" }
foreach ($name in @('server.py','detector.py','som_visualizer.py','requirements.txt')) {
  Copy-Item -LiteralPath (Join-Path $repoPath "backend/perception-service/$name") -Destination $servicePath
}
Copy-Item -LiteralPath (Join-Path $repoPath 'backend/perception-service/models') -Destination $servicePath -Recurse
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is required to build the window verifier.' }
& $compiler /nologo /target:exe /platform:x64 "/out:$nativePath/list_windows.exe" (Join-Path $PSScriptRoot 'native/list_windows.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compiling the window verifier failed.' }
& (Join-Path $runtimePath 'python.exe') -c "import fastapi, uvicorn, PIL, numpy, onnxruntime, rapidocr_onnxruntime; from detector import UIElementDetector; UIElementDetector(); print('Portable perception runtime verified')"
if ($LASTEXITCODE -ne 0) { throw 'Portable perception runtime verification failed.' }
Write-Host "Prepared portable Python runtime and native verifier in $stagingPath"
exit 0
