# This optional build deliberately distributes the owner's Gemini credential.
# Keep its artifacts private. The ordinary package:win build excludes the key.
$ErrorActionPreference = 'Stop'
$previousBundleSetting = $env:HORIZON_BUNDLE_OWNER_KEY
try {
  $env:HORIZON_BUNDLE_OWNER_KEY = '1'
  & npm.cmd run build:desktop
  if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed.' }
  & npm.cmd run prepare:installer
  if ($LASTEXITCODE -ne 0) { throw 'Installer staging failed.' }
  & npx.cmd electron-builder --win --publish never '--config.win.artifactName=Project-Horizon-Friends-Setup-${version}-${arch}.${ext}'
  if ($LASTEXITCODE -ne 0) { throw 'Friends installer build failed.' }
} finally {
  $env:HORIZON_BUNDLE_OWNER_KEY = $previousBundleSetting
}
