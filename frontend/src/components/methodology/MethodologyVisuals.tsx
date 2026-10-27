import { useId, useState } from "react";
import type { PredictionResponse } from "../../types/prediction";
import type { VisualKind } from "../../data/methodologyData";
import { featureGroups } from "../../data/methodologyFeatures";
import { getBatteryUsage } from "../../utils/batteryUsage";
import { getMethodologyResults } from "../../utils/methodologyResults";
import { modelEvaluation } from "../../data/modelEvaluation";

export function TechnicalTerm({ label, description }: { label: string; description: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="ai-term" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}><button type="button" aria-describedby={id} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>{label} ⓘ</button><span role="tooltip" id={id} hidden={!open}>{description}</span></span>;
}

export function FeatureExplorer() {
  return <div className="ai-feature-groups">{featureGroups.map((group) => <details key={group.label}><summary>{group.label} · {group.features.length} variables</summary><p>{group.description}</p><dl>{group.features.map(([name, label]) => <div key={name}><dt><code>{name}</code></dt><dd>{label}</dd></div>)}</dl></details>)}</div>;
}

function Flow({ labels }: { labels: string[] }) {
  return <ol className="ai-flow" aria-label="Flujo de procesamiento">{labels.map((label, index) => <li key={label}><span>{label}</span>{index < labels.length - 1 && <b aria-hidden="true">↓</b>}</li>)}</ol>;
}

function WindowChart() {
  return <figure><figcaption>Ventana temporal · señal ilustrativa</figcaption><svg viewBox="0 0 480 230" role="img" aria-label="Voltaje ilustrativo de 0 a 600 segundos. Solo el tramo de 0 a 300 segundos se utiliza.">
    <rect x="48" y="28" width="202" height="150" rx="6" fill="#dcefe8" /><rect x="250" y="28" width="202" height="150" rx="6" fill="#eef1f3" />
    {[60, 110, 160].map((y) => <path key={y} d={`M48 ${y}H452`} stroke="#d5e1df" />)}
    <path d="M48 45 80 55 110 61 145 70 180 80 215 91 250 106 285 117 320 129 355 143 390 155 420 166 452 174" fill="none" stroke="#178b78" strokeWidth="3" />
    <path d="M250 25V183" stroke="#123c4b" strokeDasharray="5 5" /><path d="M48 28V184H452" fill="none" stroke="#536875" />
    <text x="65" y="22">Se utiliza</text><text x="294" y="22">Fuera de ventana</text><text x="40" y="205">0 s</text><text x="228" y="205">300 s</text><text x="420" y="205">600 s</text><text x="6" y="22">V</text>
  </svg><p>No son mediciones del archivo actual. La ventana incluye el segundo 300.</p></figure>;
}

function ModelCards() {
  return <><div className="ai-vector-source">El mismo vector X₁ … X₂₉</div><div className="ai-model-cards">{[0, 5, 10, 20, 30].map((h, i) => <div key={h} className={h >= 20 ? "experimental" : ""}><small>Modelo {i + 1}</small><strong>{h === 0 ? "SoH actual" : `SoH +${h}`}</strong><span>{h >= 20 ? "Experimental" : "Horizonte principal"}</span><code>{h === 0 ? "current" : `plus_${h}`}.json</code></div>)}</div><p className="ai-visual-caption">Una misma entrada se distribuye a cinco regresores, sin encadenar las predicciones. Después se aplica el ajuste de coherencia.</p></>;
}

function TreeDiagram() {
  return <><figure><figcaption>Gradient boosting · esquema conceptual</figcaption><svg viewBox="0 0 480 200" role="img" aria-label="Tres árboles sucesivos aportan correcciones que se suman para estimar SoH. No se representan árboles reales del modelo.">
    {[75, 235, 395].map((x, i) => <g key={x}><text x={x} y="22" textAnchor="middle">Árbol {i + 1}</text><path d={`M${x} 55l-35 45m35-45 35 45m-70 0-15 35m15-35 15 35m40-35-15 35m15-35 15 35`} stroke="#8ebbae" fill="none" strokeWidth="2" />{[[x, 55], [x - 35, 100], [x + 35, 100], [x - 50, 135], [x - 20, 135], [x + 20, 135], [x + 50, 135]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" fill={cy === 135 ? "#178b78" : "#e0f0e9"} stroke="#178b78" />)}<text x={x} y="175" textAnchor="middle">Aporte {i + 1}</text></g>)}
    <text x="155" y="110" textAnchor="middle">+</text><text x="315" y="110" textAnchor="middle">+</text>
  </svg></figure><div className="ai-formula">Base + aportes de árboles → estimación de SoH</div><p>Cada nuevo árbol busca mejorar el conjunto durante el entrenamiento. En inferencia se reutilizan los árboles aprendidos.</p><ModelCards /></>;
}

function ResultsVisual({ prediction }: { prediction: PredictionResponse | null }) {
  const values = getMethodologyResults(prediction);
  const finite = values.flatMap((v) => Number.isFinite(v.value) ? [v.value!] : []);
  const rawFinite = values.flatMap((v) => Number.isFinite(v.raw) ? [v.raw!] : []);
  const low = Math.min(...finite, ...rawFinite) - 1;
  const high = Math.max(...finite, ...rawFinite) + 1;
  const x = (h: number) => 48 + h / 30 * 370;
  const y = (v: number) => 165 - (v - low) / (high - low) * 120;
  const rawDiffers = values.some((v) => v.raw != null && v.value != null && Math.abs(v.raw - v.value) > 1e-9);
  const path = values.map((v) => Number.isFinite(v.value) ? `${x(v.h)},${y(v.value!)}` : "").filter(Boolean).join(" ");
  return <><p className="ai-data-label">{prediction ? `Resultado del análisis actual · ciclo ${prediction.current_cycle}` : "Demostración educativa · datos inventados, sin llamada a la API"}</p>
    {finite.length > 0 && <figure><svg viewBox="0 0 480 220" role="img" aria-label={`SoH por horizonte. ${values.map((v) => `${v.h === 0 ? "Actual" : `Más ${v.h} ciclos`}: ${v.value?.toFixed(2) ?? "no disponible"} por ciento`).join(". ")}`}>
      <path d="M48 25V180H430" stroke="#b0c5bd" fill="none" /><text x="8" y="20">SoH %</text>
      {[low, (low + high) / 2, high].map((v) => <g key={v}><path d={`M48 ${y(v)}H430`} stroke="#e1e8e4" /><text x="5" y={y(v) + 4}>{v.toFixed(1)}</text></g>)}
      <polyline points={path} fill="none" stroke="#178b78" strokeWidth="2.5" />
      {rawDiffers && <polyline points={values.filter((v) => Number.isFinite(v.raw)).map((v) => `${x(v.h)},${y(v.raw!)}`).join(" ")} fill="none" stroke="#a66a18" strokeWidth="2" strokeDasharray="5 4" />}
      {values.filter((v) => Number.isFinite(v.value)).map((v) => <g key={v.h}><circle cx={x(v.h)} cy={y(v.value!)} r="5" fill={v.h >= 20 ? "#a66a18" : "#178b78"} /><text x={x(v.h)} y="204" textAnchor="middle">{v.h === 0 ? "Actual" : `+${v.h}`}</text></g>)}
    </svg><figcaption>Verde: valores presentados. {rawDiffers && "Ámbar discontinuo: salidas originales."} Eje vertical ajustado al rango mostrado; puntos discretos, sin interpolación predictiva.</figcaption></figure>}
    <div className="ai-results-list">{values.map((v) => <div key={v.h}><span>{v.h === 0 ? "Actual" : `+${v.h} ciclos`}</span><strong>{Number.isFinite(v.value) ? `${v.value!.toFixed(2)} %` : "No disponible"}</strong>{v.h >= 20 && <small>Experimental</small>}{rawDiffers && v.raw != null && <small>Original: {v.raw.toFixed(2)} %</small>}</div>)}</div>
    {prediction && <a href="#resultados">Volver al resultado completo →</a>}</>;
}

function SohVisual({ prediction }: { prediction: PredictionResponse | null }) {
  const value = prediction?.current_soh_percent ?? 88;
  const usage = getBatteryUsage(value);
  return <><p className="ai-data-label">{prediction ? "SoH del análisis actual" : "Indicador ilustrativo · 88 % no es una predicción"}</p><div className="ai-soh-gauge"><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="65" fill="none" stroke="#deebe5" strokeWidth="10" /><circle cx="80" cy="80" r="65" fill="none" stroke="#178b78" strokeWidth="10" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, value))} 100`} transform="rotate(-90 80 80)" /></svg><strong>{Number.isFinite(value) ? `${value.toFixed(2)} %` : "No disponible"}</strong></div><p><strong>{usage?.state ?? "Fuera de rango"}</strong></p>
    <ul className="ai-health-ranges"><li>90–100 % · Excelente</li><li>80–menos de 90 % · Bueno</li><li>70–menos de 80 % · Degradación moderada</li><li>60–menos de 70 % · Degradación alta</li><li>40–menos de 60 % · Muy degradada</li><li>Menos de 40 % · Fin de vida práctico</li></ul>
    {prediction ? <a href="#usos-bateria">Explorar los posibles usos de esta batería →</a> : <a href="#parametros">Analizar una batería para explorar sus usos →</a>}<p>Clasificación orientativa existente. No certifica seguridad.</p></>;
}

export function MethodologyVisual({ kind, prediction, compact = false }: { kind: VisualKind; prediction: PredictionResponse | null; compact?: boolean }) {
  if (compact) {
    const labels: Record<VisualKind, string[]> = {
      dataset: ["Mediciones reales", "Ejemplos de salud conocida", "Aprendizaje de patrones"],
      cleaning: ["Revisar mediciones", "Unificar unidades", "Organizar los datos"],
      features: ["Voltaje, corriente y temperatura", "Resumen de las señales", "Entradas del modelo"],
      trees: ["Ejemplos de entrenamiento", "Modelo XGBoost", "Patrones aprendidos"],
      metrics: ["Datos de referencia", "Comparar estimaciones", "Evaluar el error"],
      integration: ["Modelo entrenado", "Análisis de tus datos", "Resultados en BaterIA"],
      telemetry: ["Carga de telemetría", "Detección de campos", "Revisión de los datos"],
      window: ["Mediciones de descarga", "Primeros 300 segundos", "Señales para analizar"],
      models: ["Datos preparados", "Cinco modelos predictivos", "SoH actual y futuro"],
      results: ["Salud actual", "Proyecciones por ciclo", "Gráfica de evolución"],
      soh: ["SoH estimado", "Estado de la batería", "Posibles usos orientativos"],
    };
    return <Flow labels={labels[kind]} />;
  }
  if (kind === "window") return <WindowChart />;
  if (kind === "trees") return <TreeDiagram />;
  if (kind === "models") return <ModelCards />;
  if (kind === "results") return <ResultsVisual prediction={prediction} />;
  if (kind === "soh") return <SohVisual prediction={prediction} />;
  if (kind === "integration") return <><Flow labels={["Modelos entrenados", "Archivos XGBoost .json", "Backend FastAPI", "API /api/v1/predict", "Frontend React"]} /><p>El entrenamiento ocurre antes de usar el software. Cada análisis ejecuta inferencia y el ajuste de coherencia.</p></>;
  if (kind === "features") return <><Flow labels={["Señales temporales", "Estadísticas de 0–300 s", "Contexto e historial", "Vector ordenado: 29 entradas"]} /><div className="ai-feature-vector" aria-label="Vector de 29 características">{Array.from({ length: 29 }, (_, i) => <span key={i}>X<sub>{i + 1}</sub></span>)}</div><p>3 de contexto + 21 de señales + 2 EIS + 3 de carga previa = 29. Ejemplos numéricos de tu archivo no se recalculan aquí.</p></>;
  if (kind === "metrics") return <><div className="ai-metrics">{[
    ["MAE", "Error absoluto medio", "Promedio de |estimado − real|. Menor es mejor; en puntos porcentuales de SoH."],
    ["RMSE", "Raíz del error cuadrático medio", "Da más peso a errores grandes. Menor es mejor; en puntos porcentuales de SoH."],
    ["R²", "Coeficiente de determinación", "Compara con predecir la media de referencia. Cerca de 1 suele ser mejor; 0 equivale a esa referencia y puede ser negativo."],
  ].map(([name, label, description]) => <article key={name}><strong>{name}</strong><h4>{label}</h4><p>{description}</p><span>Interpretar por familia y horizonte</span></article>)}</div><details><summary>Resultados registrados de las evaluaciones piloto</summary><div className="table-scroll" tabIndex={0}><table><caption>MAE y RMSE en puntos porcentuales de SoH, después del ajuste. Promedios por batería; cada familia usa sus propios datos, no son comparaciones directas entre familias.</caption><thead><tr><th>Familia</th><th>Horizonte</th><th>MAE</th><th>RMSE</th></tr></thead><tbody>{modelEvaluation.map((row) => <tr key={`${row.family}-${row.horizon}`}><td>{row.family}</td><td>{row.horizon === 0 ? "Actual" : `+${row.horizon}`}</td><td>{row.mae.toFixed(2)}</td><td>{row.rmse.toFixed(2)}</td></tr>)}</tbody></table></div><p>Fuentes: docs/reconciled-comparison.json y docs/model-refinement-room-short-v2.json. La aceptación de los modelos usa estas comparaciones: falta una evaluación externa independiente.</p></details></>;
  if (kind === "dataset") return <><div className="ai-cell-grid">{[45, 46, 47, 48].map((cell) => <div key={cell}><span aria-hidden="true">▥</span><strong>B00{cell}</strong><small>Celda experimental</small></div>)}</div><Flow labels={["Ciclos de carga y descarga", "Voltaje · corriente · temperatura", "Capacidad → objetivo SoH", "Ejemplos para entrenar"]} /><p>Datos nuevos → inferencia. Capacidad/SoH de referencia → objetivo durante el entrenamiento.</p></>;
  if (kind === "cleaning") return <><p className="ai-data-label">Ejemplo de validación del software actual</p><div className="ai-mini-table"><table><caption>Antes y después de ordenar y validar</caption><thead><tr><th>Entrada</th><th>Tratamiento</th><th>Resultado</th></tr></thead><tbody><tr><td>t: 60, 0, 30 s</td><td>Orden temporal</td><td>0, 30, 60 s</td></tr><tr><td>4100 mV</td><td>Unidad elegida: mV</td><td>4,1 V</td></tr><tr><td>Voltaje sin especificar</td><td>Validación CSV</td><td>Rechazar y corregir</td></tr><tr><td>Re = 1,2 Ω</td><td>Límite EIS</td><td>Faltante (NaN)</td></tr><tr><td>t = 330 s</td><td>Ventana temporal</td><td>Fuera del cálculo</td></tr></tbody></table></div><p>No se afirma que estas reglas reconstruyan la limpieza histórica del conjunto de datos.</p></>;
  return <><p className="ai-data-label">Mediciones ilustrativas · no son tu archivo</p><div className="ai-mini-table"><table><caption>Ejemplo de una descarga de celda</caption><thead><tr><th>time_s</th><th>voltage_v</th><th>current_a</th><th>temperature_c</th></tr></thead><tbody>{[[0, 4.1, -1, 25], [60, 4.0, -1.01, 25.8], [180, 3.85, -1, 27.1], [300, 3.7, -0.99, 28.2]].map((row) => <tr key={row[0]}>{row.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table></div><Flow labels={["Tiempo → evolución", "Voltaje y corriente → respuesta eléctrica", "Temperatura → comportamiento térmico"]} /></>;
}
