param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [switch]$NoReload,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$backendPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $backendPython)) {
    throw 'No se encontro backend\.venv. Ejecuta backend\setup.ps1 desde la raiz o .\setup.ps1 desde backend.'
}

$diagnosticArguments = @((Join-Path $PSScriptRoot 'scripts\check_backend.py'))
if (-not $Check) { $diagnosticArguments += '--quiet' }
& $backendPython @diagnosticArguments
if ($LASTEXITCODE -ne 0) { throw 'El diagnostico del backend fallo. Corrige los errores indicados antes de iniciar.' }
if ($Check) { return }

$portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
try {
    $portProbe.Start()
} catch {
    throw "No se puede usar el puerto $Port. Si ya hay otra instancia, usa esa API o inicia con -Port 8001."
} finally {
    $portProbe.Stop()
}

# Usa el Python del proyecto y rutas absolutas, independientemente del directorio actual.
$uvicornArguments = @(
    '-m', 'uvicorn', 'app.main:app',
    '--app-dir', $PSScriptRoot,
    '--host', '127.0.0.1',
    '--port', "$Port"
)
if (-not $NoReload) {
    $uvicornArguments += '--reload'
    foreach ($sourceDirectory in @('app', 'model_artifacts', 'model_artifacts_v4', 'model_families', 'reference_data')) {
        $uvicornArguments += @('--reload-dir', (Join-Path $PSScriptRoot $sourceDirectory))
    }
    $uvicornArguments += @('--reload-include', '*.py', '--reload-include', '*.json')
}

Write-Host "API: http://127.0.0.1:$Port | Documentacion: http://127.0.0.1:$Port/docs"
Write-Host 'Para detener el servidor, presiona Ctrl+C. No abras otra instancia en el mismo puerto.'
& $backendPython @uvicornArguments
if ($LASTEXITCODE -notin @(0, 130, -1073741510, 3221225786)) {
    throw "El backend no pudo iniciarse (codigo $LASTEXITCODE). Si el puerto $Port esta ocupado, deten la otra instancia antes de volver a ejecutar."
}
