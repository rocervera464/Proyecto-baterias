# Ingreso manual de telemetría

## Cambios

Archivos creados:

- `frontend/src/components/ManualTelemetryEditor.tsx`: tabla editable, tarjetas por fila en móvil, pegado, confirmación para limpiar, ayuda y tres gráficas de puntos.
- `frontend/src/components/manualTelemetry.css`: presentación responsive, con Inter y los colores del proyecto.
- `frontend/src/utils/manualTelemetry.ts`: adaptación al mismo conversor del CSV, errores por campo, avisos y pegado mediante Papa Parse.
- `frontend/src/utils/validatePrediction.ts`: rechazo de respuestas incompletas, inválidas o de otro ciclo.
- `frontend/tests/manualTelemetry.test.mjs` y `backend/tests/test_manual_csv_equivalence.py`: validación y equivalencia de extremo a extremo.
- Este documento.

Archivos modificados:

- `TelemetryForm.tsx`: selector CSV/manual, estado persistente por fuente, selección exclusiva de mediciones, parámetros compartidos y bloqueo de envíos duplicados.
- `parseTelemetryCsv.ts`: se exporta la función numérica existente, sin cambiar su comportamiento.
- `services/api.ts`: verifica la respuesta antes de presentar resultados y comunica respuestas JSON inválidas.

No se modificaron modelos, características, estadísticas, endpoints, esquemas de FastAPI ni la lógica de segunda vida durante esta tarea.

## Uso

El modo predeterminado sigue siendo «Cargar archivo CSV», que también conserva la compatibilidad existente con TSV/TXT/JSON. «Ingresar datos manualmente» muestra cuatro columnas: tiempo desde el inicio de descarga en segundos, voltaje en V, corriente en A y temperatura en °C.

Se pueden agregar/eliminar filas, editar decimales con coma o punto, pegar cuatro columnas desde Excel y limpiar tras confirmar. Los bloques pegados se agregan al final; solo reemplazan filas existentes si todas estaban completamente vacías. El editor acepta pegado en sus celdas o en el área de pegado. No inserta ejemplos automáticamente.

Los estados CSV y manual son independientes y se conservan al alternar. Los parámetros generales y los cinco opcionales son compartidos. El modo inactivo queda oculto y sus controles deshabilitados; únicamente la fuente seleccionada se incluye en `discharge_samples`. Los errores de red/modelo no limpian las filas ni el archivo.

Los campos opcionales mantienen el tratamiento anterior: una sección completamente vacía no se envía; si se completa parcialmente, los campos vacíos se envían como `null`. El backend mantiene sus reglas EIS y valores faltantes.

## Validación real

El backend exige al menos dos muestras con `time_s <= 300`, tiempos no negativos y números finitos. Calcula media y desviación poblacional: no hay una frecuencia mínima definida ni exigencia de llegar exactamente al segundo 300. No se afirma que dos puntos garanticen representatividad o precisión.

El conversor CSV existente añade dos instantes distintos dentro de 0–300 s y voltaje positivo. El modo manual reutiliza `numberValue` y `convertTelemetryCsv` con las mismas columnas. Antes de convertir, marca todos los campos inválidos; una fila incompleta, incluso posterior a 300 s, impide enviar. No hay interpolación, duplicación automática ni síntesis de valores.

Los tiempos se ordenan. Igual que en el conversor CSV actual, los repetidos se conservan si existen al menos dos instantes distintos válidos en la ventana. El editor avisa que cada fila repetida influye en las estadísticas; no elimina observaciones silenciosamente. Cambiar esa política requiere modificar y evaluar ambos métodos conjuntamente.

En modo manual el tiempo significa tiempo transcurrido desde el inicio de descarga: `relativeTime=false`. Un CSV equivalente debe usar el mismo origen temporal y las mismas unidades. Con archivos cuyo primer tiempo no sea cero, activar la opción CSV «contar desde la primera muestra» cambiaría el significado y la ventana; no se considera entonces una entrada equivalente.

La corriente positiva se admite como en el importador, pero se avisa que el entrenamiento utiliza descarga negativa. No se corrige el signo automáticamente. Se avisa sobre inicio posterior a cero, cobertura menor a 300 s y registros fuera de ventana. No se impone una restricción arbitraria de densidad.

Las tres vistas previas muestran solo puntos completos y válidos, incluso si la tabla global aún tiene errores. La predicción no se habilita hasta validar toda la tabla. Se destaca 0–300 s y los puntos posteriores no se usan para inferir.

## Integración y pruebas

Ambas fuentes construyen el mismo `TelemetryRequest` y llaman a `POST /api/v1/predict` mediante `predictBattery`. El backend sigue extrayendo las mismas 29 características y usando los cinco modelos actuales. Los resultados actualizan los componentes existentes.

La prueba de equivalencia ejecuta el conversor real de frontend con Node, compara los payloads manual/CSV, calcula las 29 características con `extract_features` y envía ambas solicitudes con TestClient a la API real. Se comprobó igualdad exacta de características y respuestas, incluidos parámetros opcionales parcialmente ausentes.

Verificación ejecutada: build TypeScript/Vite correcto; 36 pruebas frontend y 28 backend aprobadas. Las pruebas cubren decimales con coma, corriente negativa, filas incompletas, números no finitos, voltaje/tiempo inválidos, mínimo real, tiempos repetidos, pegado y respuestas incompletas. Las pruebas existentes de CSV/JSON y segunda vida siguen pasando.

No hay navegador automatizable en esta sesión. Pendiente: probar selección de modo y persistencia con teclado/ratón, paste desde Excel real, confirmación de limpieza, gráficas a 320/768/1440 px, lectores de pantalla y flujo contra un servidor FastAPI en ejecución. Las tarjetas móviles y contenedores restringen el ancho; no se declara una auditoría WCAG completa.
