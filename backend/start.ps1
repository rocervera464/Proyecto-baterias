param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [switch]$NoReload
)

$ErrorActionPreference = 'Stop'
$backendPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $backendPython)) {
    throw 'No se encontro backend\.venv. Crea el entorno e instala backend\requirements.txt antes de iniciar.'
}

# Usa el Python del proyecto y rutas absolutas, independientemente del directorio actual.
$uvicornArguments = @(
    '-m', 'uvicorn', 'app.main:app',
    '--app-dir', $PSScriptRoot,
    '--host', '127.0.0.1',
    '--port', "$Port"
)
if (-not $NoReload) {
    $uvicornArguments += @('--reload', '--reload-dir', (Join-Path $PSScriptRoot 'app'))
}

Write-Host "API: http://127.0.0.1:$Port | Documentacion: http://127.0.0.1:$Port/docs"
Write-Host 'Para detener el servidor, presiona Ctrl+C. No abras otra instancia en el mismo puerto.'
& $backendPython @uvicornArguments
if ($LASTEXITCODE -ne 0) {
    throw "El backend no pudo iniciarse (codigo $LASTEXITCODE). Si el puerto $Port esta ocupado, detén la otra instancia antes de volver a ejecutar."
}
