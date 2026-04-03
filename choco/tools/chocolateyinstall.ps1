$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = 'forgeterm'
  fileType       = 'exe'
  url            = 'https://github.com/codama-dev/forgeterm/releases/download/v0.15.0/ForgeTerm-Windows-0.15.0-Setup.exe'
  checksum       = 'PLACEHOLDER'
  checksumType   = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs
