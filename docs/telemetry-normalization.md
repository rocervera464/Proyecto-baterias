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

Los modelos actuales se entrenaron con magnitudes físicas. No se introduce escalado MinMax ni estandarización exclusiva en inferencia: requeriría volver a entrenar con la misma transformación. Tampoco se recortan mediciones extremas a mínimos/máximos del entrenamiento, pues eso ocultaría datos fuera de dominio y podría alterar indicios de degradación. Se mantiene la comprobación de compatibilidad; la ruta de producción no omite esta validación por el indicador heredado exploratorio.

El filtro EIS existente se conserva: valores fuera de `0 < Re < 1 Ω` o `0 < Rct < 2 Ω` se tratan como ausentes, ahora con aviso explícito. Esto no convierte una medición desconocida en una resistencia válida.

## Identificación y recuperación automática de contexto

Al cargar un archivo, el frontend lee primero las columnas y metadatos declarados
y consulta `POST /api/v1/telemetry/identify` con las mediciones. Si coinciden de
forma única con una ventana original, recupera ciclo, ambiente, corte, nivel y
química. Los campos dejan de pedir intervención manual cuando se han identificado.
Se reconoce también contexto dentro de `metadata`, `context`, `parameters` o
`battery` en JSON, y unidades explícitas como `ambient_temperature_f` o `2000 mV`.

`normalize_inputs` es verdadero por defecto en `/predict`, `/compatibility` y
`/validate`. Una referencia verificada puede restaurar contexto incorrecto
(por ejemplo, ambiente 25 → 4 °C en B0045 ciclo 30) y corregir unidades de las
señales. `input_normalization` registra valores previos/nuevos y operaciones;
`telemetry_reference` identifica la fuente. Los clientes utilizan el ciclo
restaurado únicamente cuando viene acompañado de este registro de procedencia.
La interfaz muestra estos cambios dentro de los detalles, sin alertas repetidas.

Se puede desactivar esta recuperación mediante `normalize_inputs: false`.
Si las señales no tienen una coincidencia única, se conservan los datos
declarados y se solicitan los campos ausentes. No se deduce el ciclo absoluto,
el corte o la química a partir de una curva desconocida, ni se fuerza una
predicción sobre medidas genuinamente incompatibles. Los horizontes de producción
siguen determinados por el manifiesto; la normalización no habilita investigación.

El catálogo reproducible y su alcance se documentan en
`backend/reference_data/README.md`. Las pruebas cubren conversiones, fuente
ambigua, señales desconocidas, conservación de datos, recuperación de los cinco
campos y coherencia entre los endpoints y la predicción.

## Compatibilidad antes de predecir

Un `200` en `/identify` confirma que se pudo evaluar el registro. Solo
`matched: true` significa que se identificó una referencia; con `matched: false`
se conservan las mediciones y el contexto declarados.

La interfaz consulta `/api/v1/telemetry/compatibility` antes de enviar `/predict`.
Si no hay compatibilidad, muestra una explicación y no solicita una predicción
que el servidor rechazaría. La selección comprueba todas las familias habilitadas
y prioriza una que cumpla los rangos y requisitos de muestreo disponibles. La
comprobación y la predicción usan la misma selección y normalización.

El informe incluye `message` con el contexto y los grupos de señales que impiden
predecir. Por ejemplo, un ambiente declarado de 22 °C queda fuera de la referencia
de entrenamiento de 24 °C de la familia de 2 A; cambiarlo a 24 °C no corrige una
corriente medida de 1 A ni su transitorio. Los 22 °C no son una lectura inválida:
el modelo disponible no cubre esas condiciones. La aplicación no convierte una
temperatura real a la del entrenamiento para forzar una salida.

Los clientes que llamen directamente a `/predict` con datos incompatibles siguen
recibiendo `422` y el informe detallado. No se amplían rangos de entrenamiento ni
se habilitan horizontes sin evaluación adicional para eliminar ese rechazo.

Caso de regresión: `backend/tests/fixtures/bateria_degradacion_avanzada_prueba.csv`
conserva el CSV indicado por el usuario (301 mediciones, voltaje 3,0052–3,917 V,
corriente −1,487 a −1,4152 A y temperatura 30,5–37,857 °C). No consta una fuente
de ensayo que permita recuperar su contexto. Con ciclo 30, ambiente declarado
22 °C y corte 2,2 V, el archivo se importa pero no tiene una familia compatible.
La prueba conserva sus valores, verifica que no se le atribuya una identidad NASA
y no utiliza el archivo como datos de entrenamiento ni como evidencia de precisión.
