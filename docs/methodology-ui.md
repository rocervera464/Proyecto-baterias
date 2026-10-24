# Recorrido interactivo de metodología

Esta implementación sustituye los cinco textos de metodología por dos recorridos de seis etapas. Conserva la marca actual BaterIA, el ancla `#metodologia`, los modelos y el pipeline existente. Los cambios previos del backend ya presentes en Git no forman parte de esta tarea.

## Archivos

- Modificados: `frontend/src/components/MethodologySection.tsx` y `frontend/src/pages/PredictionPage.tsx`.
- Creados: `frontend/src/components/methodology/MethodologyVisuals.tsx`, `methodology.css`, `frontend/src/data/methodologyData.ts`, `methodologyFeatures.ts`, `frontend/src/utils/methodologyResults.ts`, `frontend/tests/methodology.test.mjs` y este documento.

## Comportamiento

La pestaña de predicción es inicial. Cada recorrido conserva su posición al alternar pestañas. Las seis etapas son seleccionables directamente; Anterior/Siguiente respetan los extremos. Las pestañas admiten flechas izquierda/derecha, Inicio y Fin; los botones y desplegables nativos admiten teclado. Los términos técnicos se explican al enfocar o pasar el puntero y se pueden cerrar con Escape. Las animaciones respetan movimiento reducido.

Los visuales incluyen una mini tabla de descarga, validación antes/después, ventana 0–300 s, vector ordenado de 29 variables, tres árboles conceptuales, distribución de entradas a cinco modelos, integración FastAPI/React, tarjetas MAE/RMSE/R² y un indicador circular de SoH.

`PredictionPage` pasa su estado `prediction` al recorrido. No hay solicitudes HTTP adicionales ni recálculo de características en JavaScript. Sin predicción se identifica una demostración sintética. Con predicción se muestran los valores exactos recibidos, las salidas originales cuando están disponibles y su diferencia respecto al ajuste. Un horizonte ausente se muestra como no disponible; no se rellena con un valor de demostración. La clasificación reutiliza `getBatteryUsage` y enlaza la sección de segunda vida existente.

La gráfica utiliza posiciones proporcionales al horizonte y un eje vertical ajustado cuyo rango se rotula. Los puntos son discretos; las líneas no constituyen predicciones entre ciclos. Se distingue el resultado presentado de la salida original.

## Evidencia científica

- `backend/model_artifacts/metadata.json`: celdas B0045–B0048, ventana, definición de SoH, tamaños declarados de entrenamiento y carácter experimental de +20/+30.
- `features.json` y `feature_engineering.py`: orden exacto, estadísticas poblacionales, delta final menos inicial, campos opcionales y límites EIS.
- `manifest.json`, `model_service.py` y ruta de predicción: cinco regresores, vector común, caché y ajuste isotónico existente.
- Importador de telemetría: unidades, origen temporal, validación de muestras y selección del tramo. Estas reglas se describen como comportamiento actual, sin atribuirlas a un entrenamiento histórico no reproducible.
- `docs/model-review.md` y `docs/model-audit.json`: alcance del diagnóstico, sin métricas completas de validación.
- [Documentación oficial de XGBoost](https://xgboost.readthedocs.io/en/stable/tutorials/model.html): árboles, aprendizaje supervisado y aditivo. El diagrama no es una explicación de árboles reales ni SHAP.

No se encontraron notebooks, MAE/RMSE/R² verificables o registros de la partición. No se inventan métricas, intervalos de confianza, RUL ni exactitud fuera de dominio. La tendencia no creciente corresponde a un ajuste posterior existente, no a una prueba de precisión.

## Verificación

- Compilación TypeScript y Vite correcta.
- 30 pruebas frontend aprobadas: incluye CSV/JSON, selección de tramos, segunda vida, coherencia, correspondencia exacta de las 29 variables y uso de resultados sin mutaciones ni mezcla con datos demostrativos.
- 24 pruebas backend aprobadas, sin cambios del backend durante esta tarea.
- `git diff --check` sin errores de formato.
- No se dispone de navegador automatizable en esta sesión. La navegación por pestañas, las doce etapas, los extremos, detalles y enlaces se revisaron en código, pero falta verificarlos mediante interacción real.

Revisión manual pendiente: recorrer ambas pestañas y los seis pasos con ratón y teclado, abrir/cerrar detalles anidados, comprobar Escape en tooltips, analizar un CSV y contrastar la etapa de resultados, cambiar de predicción a estado vacío, revisar 320/375/768/1440 px y zoom del 200 %, movimiento reducido y lector de pantalla. No se afirma conformidad WCAG 2.2 AA sin esa auditoría.
