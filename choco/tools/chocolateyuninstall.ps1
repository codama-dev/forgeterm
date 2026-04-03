$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = 'forgeterm'
  softwareName   = 'ForgeTerm*'
  fileType       = 'exe'
  silentArgs     = '/S'
  validExitCodes = @(0)
}

$uninstalled = $false
[array]$key = Get-UninstallRegistryKey -SoftwareName $packageArgs['softwareName']

if ($key.Count -eq 1) {
  $key | ForEach-Object {
    $packageArgs['file'] = "$($_.UninstallString)"
    Uninstall-ChocolateyPackage @packageArgs
  }
} elseif ($key.Count -eq 0) {
  Write-Warning "ForgeTerm has already been uninstalled by other means."
} elseif ($key.Count -gt 1) {
  Write-Warning "$($key.Count) matches found! To the same version? Uninstalling all."
  $key | ForEach-Object {
    $packageArgs['file'] = "$($_.UninstallString)"
    Uninstall-ChocolateyPackage @packageArgs
  }
}
