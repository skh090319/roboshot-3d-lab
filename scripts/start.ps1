$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$launchUrl = 'http://127.0.0.1:4173'

if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'dist/index.html'))) {
    throw 'dist/index.html이 없습니다. 프로젝트 폴더에서 npm install 및 npm run build를 먼저 실행하세요.'
}

function Test-RoboShotReady {
    try {
        $response = Invoke-RestMethod -Uri "$launchUrl/__roboshot_health" -TimeoutSec 1
        return $response.app -eq 'RoboShot 3D Lab' -and $response.ready -eq $true
    } catch {
        return $false
    }
}

if (-not (Test-RoboShotReady)) {
    $portableNode = Join-Path $projectDirectory 'runtime/node.exe'
    if (Test-Path -LiteralPath $portableNode) {
        $nodeExecutable = $portableNode
    } else {
        $installedNode = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($null -eq $installedNode) {
            throw 'Node.js가 없습니다. Node.js 22.12 이상을 설치하거나 runtime/node.exe가 포함된 배포본을 사용하세요.'
        }
        $nodeExecutable = $installedNode.Source
    }
    $serveScript = Join-Path $PSScriptRoot 'serve.mjs'
    $serverProcess = Start-Process -FilePath $nodeExecutable -ArgumentList ('"' + $serveScript + '"') -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru
    $isReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (Test-RoboShotReady) { $isReady = $true; break }
        if ($serverProcess.HasExited) { break }
        Start-Sleep -Milliseconds 150
    }
    if (-not $isReady) {
        throw 'RoboShot을 시작하지 못했습니다. 포트 4173 사용 여부를 확인하거나 터미널에서 npm start로 오류를 확인하세요.'
    }
}
Start-Process $launchUrl
