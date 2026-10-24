# Normalización de unidades de telemetría

La API de predicción y la evaluación de compatibilidad utilizan el mismo esquema de entrada. Ahora aceptan un objeto opcional `units`:

```json
{
  "units": {
    "time": "ms",
    "voltage": "mV",
    "current": "mA",
    "temperature": "F",
    "resistance": "mohm"
  }
}
```

El objeto acompaña los demás campos de la solicitud, que mantienen sus nombres por compatibilidad. Las unidades declaradas se aplican a todas las mediciones correspondientes, incluido el voltaje de corte, la temperatura ambiente, EIS y carga previa. No admite mezclar unidades en una misma columna. Las diferencias de temperatura en Fahrenheit solo se multiplican por 5/9; no se les resta 32. Las diferencias en kelvin equivalen a las de Celsius.

Unidades admitidas: tiempo `s`, `ms`, `min`, `h`; voltaje `V`, `mV`; corriente `A`, `mA`; temperatura `C`, `F`, `K`; resistencia `ohm`, `mohm`. Sin declaración se conserva el contrato anterior: segundos, voltios, amperios, Celsius y ohmios. No se adivinan unidades por magnitud.

La conversión se realiza antes de validar límites y calcular las 29 características. La representación resultante utiliza unidades canónicas, evitando conversiones repetidas al serializar y validar otra vez. El informe de compatibilidad muestra un aviso si hubo conversión.

La interfaz ya convierte las unidades seleccionadas en el importador antes de enviar las mediciones; debe seguir enviando esos valores en unidades canónicas, sin declarar de nuevo las unidades originales. El ingreso manual sigue usando las unidades indicadas en sus etiquetas.

Los modelos actuales se entrenaron con magnitudes físicas. No se introduce escalado MinMax ni estandarización exclusiva en inferencia: requeriría volver a entrenar con la misma transformación. Tampoco se recortan mediciones extremas a mínimos/máximos del entrenamiento, pues eso ocultaría datos fuera de dominio y podría alterar indicios de degradación. Se mantienen la comprobación de compatibilidad y los modos estricto/exploratorio.

El filtro EIS existente se conserva: valores fuera de `0 < Re < 1 Ω` o `0 < Rct < 2 Ω` se tratan como ausentes, ahora con aviso explícito. Esto no convierte una medición desconocida en una resistencia válida.

Verificación: 43 pruebas backend aprobadas, incluidas equivalencia de características entre unidades, diferencias térmicas, conservación de valores extremos, serialización sin doble conversión y rechazo de unidades o valores inválidos.
