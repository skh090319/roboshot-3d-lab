param(
    [string]$DesktopDirectory = [Environment]::GetFolderPath('Desktop'),
    [string]$NodeExecutable = '',
    [string]$NpmSource = ''
)
$ErrorActionPreference = 'Stop'
$sourceDirectory = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$desktopRoot = [System.IO.Path]::GetFullPath($DesktopDirectory)
if (-not (Test-Path -LiteralPath $desktopRoot -PathType Container)) {
    throw "Desktop directory not found: $desktopRoot"
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceDirectory 'dist/index.html') -PathType Leaf)) {
    throw 'Run npm run build before packaging.'
}
if (-not $NodeExecutable -and (Test-Path -LiteralPath (Join-Path $sourceDirectory 'runtime/node.exe'))) {
    $NodeExecutable = Join-Path $sourceDirectory 'runtime/node.exe'
}
if (-not $NodeExecutable -or -not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
    $installedNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $installedNode) { throw 'Node.js executable not found.' }
    $NodeExecutable = $installedNode.Source
}
if (-not $NpmSource) {
    $NpmSource = Join-Path $sourceDirectory 'runtime/node_modules/npm'
    $installedNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath $NpmSource) -and $installedNpm) {
        $NpmSource = Join-Path (Split-Path -Parent $installedNpm.Source) 'node_modules/npm'
    }
}

# A fresh destination is always chosen; no existing project is overwritten.
$destination = Join-Path $desktopRoot 'RoboShot 3D Lab'
if (Test-Path -LiteralPath $destination) {
    $destination = Join-Path $desktopRoot ('RoboShot 3D Lab ' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$suffix = 2
$candidateBase = $destination
while (Test-Path -LiteralPath $destination) {
    $destination = "$candidateBase-$suffix"
    $suffix++
}
$destination = [System.IO.Path]::GetFullPath($destination)
if (-not $destination.StartsWith($desktopRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Destination must be a new child directory of the desktop.'
}
New-Item -ItemType Directory -Path $destination | Out-Null

# Only deliverable source, models and compiled assets are copied.
$directories = @('src', 'public', 'assets', 'scripts', 'tests', 'dist')
foreach ($directory in $directories) {
    $sourcePath = Join-Path $sourceDirectory $directory
    if (Test-Path -LiteralPath $sourcePath -PathType Container) {
        Copy-Item -LiteralPath $sourcePath -Destination $destination -Recurse
    }
}
$files = @('index.html', 'package.json', 'package-lock.json', 'README.md', 'VALIDATION.md', 'vite.config.js', '.gitignore', 'RoboShot-실행.cmd')
foreach ($filename in $files) {
    $sourcePath = Join-Path $sourceDirectory $filename
    if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $destination $filename)
    }
}

$runtimeDirectory = Join-Path $destination 'runtime'
New-Item -ItemType Directory -Path $runtimeDirectory | Out-Null
Copy-Item -LiteralPath $NodeExecutable -Destination (Join-Path $runtimeDirectory 'node.exe')
$nodeLicense = Join-Path $sourceDirectory 'runtime/Node-LICENSE.txt'
if (Test-Path -LiteralPath $nodeLicense -PathType Leaf) {
    Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $runtimeDirectory 'Node-LICENSE.txt')
}

# Optional portable npm supports editing in VS Code even when npm is not on PATH.
if (Test-Path -LiteralPath (Join-Path $NpmSource 'bin/npm-cli.js') -PathType Leaf) {
    $npmModules = Join-Path $runtimeDirectory 'node_modules'
    New-Item -ItemType Directory -Path $npmModules | Out-Null
    Copy-Item -LiteralPath $NpmSource -Destination (Join-Path $npmModules 'npm') -Recurse
    $npmLauncher = @'
@echo off
setlocal
set "PATH=%~dp0runtime;%PATH%"
"%~dp0runtime\node.exe" "%~dp0runtime\node_modules\npm\bin\npm-cli.js" %*
exit /b %errorlevel%
'@
    [System.IO.File]::WriteAllText((Join-Path $destination 'npm.cmd'), $npmLauncher, [System.Text.Encoding]::ASCII)
}

$shortcutPath = Join-Path $desktopRoot 'RoboShot 3D Lab.lnk'
if (Test-Path -LiteralPath $shortcutPath) {
    $shortcutPath = Join-Path $desktopRoot ((Split-Path -Leaf $destination) + '.lnk')
}
$shortcutSuffix = 2
$shortcutBase = [System.IO.Path]::Combine($desktopRoot, [System.IO.Path]::GetFileNameWithoutExtension($shortcutPath))
while (Test-Path -LiteralPath $shortcutPath) {
    $shortcutPath = "$shortcutBase-$shortcutSuffix.lnk"
    $shortcutSuffix++
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $destination 'RoboShot-실행.cmd'
$shortcut.WorkingDirectory = $destination
$shortcut.Description = 'RoboShot 3D Lab - offline physics simulation'
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,160"
$shortcut.Save()

[pscustomobject]@{
    Project = $destination
    Shortcut = $shortcutPath
    NodeVersion = (& (Join-Path $runtimeDirectory 'node.exe') --version)
    PortableNpm = (Test-Path -LiteralPath (Join-Path $destination 'npm.cmd'))
} | ConvertTo-Json
