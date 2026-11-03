import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import type { TelemetryRequest } from "../types/telemetry";
import { ANALYSIS_STEP_DURATION_MS } from "../utils/analysisPresentation";
import "./predictionProgress.css";

const steps = [
  "Validar la telemetría",
  "Preparar las características",
  "Evaluar la compatibilidad",
  "Estimar la salud de la batería",
  "Preparar los resultados",
];

const format = (value: number, digits = 2) => value.toLocaleString("es-CO", { maximumFractionDigits: digits });

const activity = [
  ["Leyendo marcas de tiempo", "Localizando voltaje y corriente", "Identificando registros de temperatura", "Reuniendo las muestras recibidas"],
  ["Calculando rangos de las mediciones", "Resumiendo la corriente registrada", "Revisando la variación térmica", "Midiendo la duración registrada"],
  ["Revisando el nivel de medición", "Consultando la química declarada", "Reuniendo las condiciones de descarga", "Esperando la evaluación de compatibilidad"],
  ["Mediciones enviadas al servicio", "Consulta de salud de la batería", "Consulta de horizontes futuros", "Esperando la respuesta de los modelos"],
  ["Organizando la vista de salud actual", "Preparando las tarjetas de proyección", "Preparando la gráfica de resultados", "Esperando el informe del servicio"],
];

function AnalysisVisual({ telemetry, active }: { telemetry: TelemetryRequest; active: number }) {
  const traces = useMemo(() => {
    const samples = telemetry.discharge_samples;
    return (["voltage_v", "current_a", "temperature_c"] as const).map(key => {
      const values = Array.from({ length: Math.min(90, samples.length) }, (_, index) => {
        const sample = samples[Math.round(index * (samples.length - 1) / Math.max(1, Math.min(90, samples.length) - 1))];
        return sample[key];
      }).filter(Number.isFinite);
      const min = Math.min(...values);
      const max = Math.max(...values);
      return values.map((value, index) => `${12 + index * 576 / Math.max(1, values.length - 1)},${78 - (value - min) / (max - min || 1) * 56}`).join(" ");
    });
  }, [telemetry]);

  return <div className={`analysis-instrument analysis-instrument-${active}`}>
    <div className="analysis-instrument-heading"><span>{["Lectura de señales", "Perfil de las mediciones", "Condiciones → modelo", "Flujo de estimación", "Composición del informe"][active]}</span><span className="analysis-instrument-badge">{active < 2 ? "Tus datos" : "En proceso"}</span></div>
    <svg viewBox="0 0 600 100" fill="none" aria-hidden="true">
      {[20, 40, 60, 80].map(y => <path key={y} d={`M0 ${y}H600`} stroke="#178b78" strokeOpacity=".09" />)}
      {active < 2 ? <>
        {traces.map((points, index) => <polyline key={index} className="analysis-trace" points={points} stroke={["#178b78", "#4f91b2", "#c28a38"][index]} strokeWidth="2" strokeLinejoin="round" pathLength="1" />)}
        <rect className="analysis-scan-beam" width="35" height="100" fill="#178b7814" />
      </> : <>
        <path d="M90 50H510" stroke="#c4dfd1" strokeWidth="2" />
        <path className="analysis-moving-packets" d="M90 50H510" stroke="#178b78" strokeWidth="4" strokeDasharray="6 65" />
        {[90, 230, 370, 510].map((x, index) => <g key={x}>
          <circle className="analysis-compute-node" style={{ animationDelay: `${index * .3}s` }} cx={x} cy="50" r={index === 1 ? 24 : 17} fill="#edf8f2" stroke="#178b78" />
          <path d={`M${x - 6} 50h12M${x} 44v12`} stroke="#178b78" strokeWidth="2" />
        </g>)}
      </>}
    </svg>
    <div className="analysis-instrument-legend">{active < 2 ? <><span>● Voltaje</span><span>● Corriente</span><span>● Temperatura</span><small>Escalas normalizadas · vista resumida</small></> : <><span>Datos</span><span>{active === 2 ? "Condiciones" : "Modelo"}</span><span>{active === 4 ? "Informe" : "Respuesta"}</span><small>Representación del proceso</small></>}</div>
  </div>;
}

function summarize(telemetry: TelemetryRequest) {
  const ranges = {
    voltage_v: { min: Infinity, max: -Infinity },
    current_a: { min: Infinity, max: -Infinity },
    temperature_c: { min: Infinity, max: -Infinity },
    time_s: { min: Infinity, max: -Infinity },
  };
  for (const sample of telemetry.discharge_samples) {
    for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
      if (Number.isFinite(sample[key])) {
        ranges[key].min = Math.min(ranges[key].min, sample[key]);
        ranges[key].max = Math.max(ranges[key].max, sample[key]);
      }
    }
  }
  const range = (key: keyof typeof ranges, unit: string) => Number.isFinite(ranges[key].min)
    ? `${format(ranges[key].min)} – ${format(ranges[key].max)} ${unit}` : "Sin datos";
  return [
    { symbol: "V", label: "Voltaje", value: range("voltage_v", "V"), detail: "Mínimo y máximo registrados" },
    { symbol: "A", label: "Corriente", value: range("current_a", "A"), detail: "Intervalo de corriente medido" },
    { symbol: "°C", label: "Temperatura", value: range("temperature_c", "°C"), detail: "Rango térmico de las muestras" },
    { symbol: "t", label: "Tiempo registrado", value: Number.isFinite(ranges.time_s.min) ? `${format(ranges.time_s.max - ranges.time_s.min)} s` : "Sin datos", detail: "Entre la primera y última marca temporal" },
  ];
}

export default function PredictionProgress({ telemetry }: { telemetry: TelemetryRequest }) {
  const [active, setActive] = useState(0);
  const [activityTick, setActivityTick] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const variables = useMemo(() => summarize(telemetry), [telemetry]);
  const notes = [
    "Leyendo las variables presentes en tus mediciones…",
    "Resumiendo los rangos y el tiempo registrado…",
    "Contrastando las condiciones con el modelo…",
    "Consultando los modelos de salud y proyección…",
    "Esperando la respuesta final del análisis…",
  ];

  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    const interval = window.setInterval(() => setActive(value => Math.min(value + 1, steps.length - 1)), ANALYSIS_STEP_DURATION_MS);
    const activityInterval = window.setInterval(() => setActivityTick(value => value + 1), 1100);
    return () => { window.clearInterval(interval); window.clearInterval(activityInterval); };
  }, []);

  return <section ref={panel} className="prediction-progress" aria-labelledby="prediction-progress-title">
    <div className="prediction-progress-heading">
      <span className="prediction-progress-orb" aria-hidden="true"><Icon name="battery" /></span>
      <div><p className="section-kicker">BATERIA ESTÁ ANALIZANDO</p><h3 id="prediction-progress-title">De tus mediciones a una predicción</h3></div>
      <span className="prediction-progress-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
    <ol className="analysis-window-timeline" aria-label="Etapas del análisis">
      {steps.map((step, index) => <li key={step} className={index === active ? "is-active" : index < active ? "is-reviewed" : ""} aria-current={index === active ? "step" : undefined}>
        <span>{index < active ? <Icon name="check" /> : index + 1}</span><small>{step}</small>
      </li>)}
    </ol>
    <div className="analysis-window-stage">
      <article key={active} className="analysis-window" aria-labelledby="analysis-window-title">
        <header className="analysis-window-bar"><span className="analysis-window-controls" aria-hidden="true"><i /><i /><i /></span><span>ANÁLISIS DE TELEMETRÍA</span><span>{active + 1} / {steps.length}</span></header>
        <div className="analysis-window-body">
          <div className="analysis-window-title"><span className="prediction-progress-orb" aria-hidden="true"><Icon name={(["upload", "chart", "shield", "battery", "layers"] as const)[active]} /></span><div><p className="section-kicker">PASO {active + 1}</p><h4 id="analysis-window-title">{steps[active]}</h4></div></div>
          <p className="analysis-window-description">{notes[active]}</p>
          <AnalysisVisual telemetry={telemetry} active={active} />
          <div className="analysis-window-content">
            {active === 0 && <>
              <div className="analysis-window-highlight"><strong>{format(telemetry.discharge_samples.length, 0)}</strong><span>muestras recibidas para analizar</span></div>
              <div className="analysis-field-list">{variables.map(variable => <div key={variable.label}><span className="telemetry-variable-symbol">{variable.symbol}</span><span>{variable.label}</span><small>Campo recibido</small></div>)}</div>
            </>}
            {active === 1 && <div className="telemetry-variable-grid">{variables.map((variable, index) => <article key={variable.label} className="telemetry-variable is-discovered" style={{ animationDelay: `${index * 120}ms` }}><span className="telemetry-variable-symbol" aria-hidden="true">{variable.symbol}</span><span className="telemetry-variable-label">{variable.label}</span><strong>{variable.value}</strong><small>{variable.detail}</small></article>)}</div>}
            {active === 2 && <>
              <div className="analysis-facts"><div><span>Nivel de medición</span><strong>{{ unknown: "Sin especificar", cell: "Celda", module: "Módulo", pack: "Pack" }[telemetry.measurement_level ?? "unknown"]}</strong></div><div><span>Química declarada</span><strong>{{ unknown: "Sin especificar", "li-ion": "Ion de litio", LFP: "LFP", "lead-acid": "Plomo-ácido", other: "Otra" }[telemetry.chemistry ?? "unknown"]}</strong></div><div><span>Modo de análisis</span><strong>{telemetry.analysis_mode === "exploratory" ? "Exploratorio" : "Estricto"}</strong></div><div><span>Voltaje de corte</span><strong>{format(telemetry.cutoff_voltage_v)} V</strong></div></div>
              <p className="analysis-window-hint">La respuesta del modelo confirmará la compatibilidad de estas condiciones.</p>
            </>}
            {active === 3 && <>
              <div className="analysis-model-flow"><span><Icon name="layers" />Tus mediciones</span><span className="analysis-flow-line" aria-hidden="true" /><span><Icon name="battery" />Modelo de salud</span><span className="analysis-flow-line" aria-hidden="true" /><span><Icon name="chart" />Estimación SoH</span></div>
              <div className="telemetry-context"><span>Ciclo <b>{format(telemetry.cycle, 0)}</b></span><span>Ambiente <b>{format(telemetry.ambient_temperature_c)} °C</b></span><span>Datos EIS <b>{telemetry.previous_eis && Object.values(telemetry.previous_eis).some(value => value != null) ? "Incluidos" : "No incluidos"}</b></span></div>
            </>}
            {active === 4 && <>
              <div className="analysis-window-highlight"><span className="analysis-waiting-ring" aria-hidden="true" /><div><strong>Preparando tu informe</strong><span>La estimación se mostrará al terminar el análisis.</span></div></div>
              <div className="analysis-result-preview">{["Mediciones", "Compatibilidad", "Salud actual", "Horizontes habilitados"].map(label => <div key={label}><span>{label}</span><i aria-hidden="true" /></div>)}</div>
            </>}
          </div>
          <footer className="analysis-window-footer"><span className="telemetry-live-dot" aria-hidden="true" /><span key={activityTick} className="analysis-activity-message">{activity[active][activityTick % 4]}</span><span className="prediction-progress-dots" aria-hidden="true"><i /><i /><i /></span></footer>
        </div>
      </article>
    </div>
    <div className="prediction-progress-track" aria-hidden="true"><span /></div>
    <span className="prediction-progress-sr" role="status">{steps[active]}</span>
  </section>;
}
