# Identificación de registros de telemetría

`telemetry_context_catalog.json` contiene 924 huellas de ventanas medidas y su
contexto original. Las fuentes son B0045–B0048 y B0005/B0006/B0007/B0018, con
los SHA-256 de los archivos MAT utilizados. No contiene capacidad, SoH,
etiquetas futuras ni predicciones.

Se ordenan las cuatro señales por tiempo, se selecciona 0–300 s y se calcula
SHA-256 de los valores representados con ocho decimales. Esto tolera diferencias
de representación al exportar CSV/Excel. Una coincidencia debe ser única y
cubrir toda la ventana disponible de referencia, no solo uno o dos puntos.
El nombre del archivo no interviene en la identificación.

Se pueden probar conversiones de segundos/milisegundos/minutos/horas,
V/mV, A/mA, signo de corriente y Celsius/Fahrenheit/kelvin. Una conversión
automática sin declaración solo se acepta si las cuatro señales resultantes
coinciden con una referencia única. No se elige por magnitud o por proximidad
a los límites de entrenamiento. Si hay ambigüedad no se completa el contexto.

Para regenerar con los datos originales locales:

```powershell
.\backend\.venv\Scripts\python.exe backend/scripts/build_telemetry_context_catalog.py
```

Esto es recuperación de procedencia, no un nuevo modelo predictivo. No amplía
el dominio validado ni demuestra precisión con nuevas baterías. La compatibilidad
del modelo se sigue evaluando después de recuperar el contexto y normalizar unidades.
