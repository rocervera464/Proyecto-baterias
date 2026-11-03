param(
    [string]$Python = ''
)

$ErrorActionPreference = 'Stop'
$venvDirectory = Join-Path $PSScriptRoot '.venv'
$backendPython = Join-Path $venvDirectory 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $backendPython)) {
    $pythonPrefix = @()
    if ($Python) {
        $setupPython = $Python
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $setupPython = 'py'
        $pythonPrefix = @('-3.12')
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        $setupPython = 'python'
    } else {
        throw 'No se encontro Python. Instala Python 3.12 o indica su ruta con -Python.'
    }
    & $setupPython @pythonPrefix -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo ejecutar un Python compatible. Usa Python 3.12.' }
    & $setupPython @pythonPrefix -m venv $venvDirectory
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear backend\.venv.' }
}

& $backendPython -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'El entorno existente requiere Python 3.12 o superior. Crea un entorno con Python 3.12 antes de instalar estas dependencias.' }
& $backendPython -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias. Revisa el error de pip y la conexion al indice de paquetes.' }
& $backendPython -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Hay dependencias incompatibles en backend\.venv.' }
& $backendPython (Join-Path $PSScriptRoot 'scripts\check_backend.py')
if ($LASTEXITCODE -ne 0) { throw 'Las dependencias se instalaron, pero falta corregir los artefactos o la configuracion indicados.' }
Write-Host 'Preparacion completada. Inicia con backend\start.ps1 desde la raiz o .\start.ps1 desde backend.'
