import { useEffect, useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PredictionResponse } from "../types/prediction";
import "./predictionChart.css";

const percent = (value: number) => `${value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

export default function PredictionChart({ prediction, embedded = false }: { prediction: PredictionResponse; embedded?: boolean }) {
  const [zoom, setZoom] = useState(false);
  const [reference, setReference] = useState(true);
  const [horizon, setHorizon] = useState(0);
  const [motion, setMotion] = useState(false);
  const titleId = useId();
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const data = [
    { cycle: prediction.current_cycle, soh: prediction.current_soh_percent, horizon: 0, label: "Actual" },
    ...prediction.future_predictions.map(item => ({ cycle: item.target_cycle, soh: item.predicted_soh_percent,
      horizon: item.horizon_cycles, label: `+${item.horizon_cycles} ciclos` })),
  ];
  const selected = data.find(point => point.horizon === horizon) ?? data[0];
  const values = data.map(point => point.soh);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max(1, (max - min) * .3);
  const domain: [number, number] = zoom ? [Math.max(0, Math.floor(min - padding)), Math.min(120, Math.ceil(max + padding))] : [0, max > 100 ? 120 : 100];
  return <section id="grafica" className={`prediction-chart interactive-forecast${embedded ? " forecast-embedded" : ""}`} aria-labelledby={titleId}>
    <h3 id={titleId} className={embedded ? "sr-only" : undefined}>Evolución estimada del SoH</h3>
    <div className="forecast-toolbar" aria-label="Opciones de la gráfica">
      <div className="forecast-scale" role="group" aria-label="Escala vertical"><button type="button" aria-pressed={!zoom} onClick={() => setZoom(false)}>Vista completa</button><button type="button" aria-pressed={zoom} onClick={() => setZoom(true)}>Ver detalle</button></div>
      <details className="forecast-options"><summary>Opciones</summary><div className="forecast-toggles"><label><input type="checkbox" checked={reference} onChange={event => setReference(event.target.checked)} />Referencia del 80 %</label></div></details>
    </div>
    <div className="forecast-selected" aria-live="polite" aria-atomic="true"><div><span>{selected.label}{selected.cycle == null ? "" : ` · ciclo ${selected.cycle}`}</span><strong>{percent(selected.soh)}</strong></div></div>
    {data.length === 1 && <p className="forecast-simple-note">Solo está disponible el SoH actual. No hay horizontes futuros habilitados para este modelo.</p>}
    {reference && domain[1] < 80 && <p className="forecast-simple-note">La referencia del 80 % queda fuera de la escala ampliada.</p>}
    {reference && domain[0] > 80 && <p className="forecast-simple-note">La referencia del 80 % queda fuera de la escala ampliada.</p>}
    <div className="forecast-canvas"><div className="chart-container"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 22, right: 22, left: 0, bottom: 20 }} accessibilityLayer>
        <CartesianGrid stroke="#dce8e3" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="horizon" type="number" domain={data.length === 1 ? [0, 1] : ["dataMin", "dataMax"]} ticks={data.map(point => point.horizon)} tickFormatter={value => value === 0 ? "Actual" : `+${value}`} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#536875", fontSize: 11 }} label={{ value: "Horizonte (ciclos)", position: "insideBottom", offset: -15, fill: "#536875" }} />
        <YAxis domain={domain} width={55} axisLine={false} tickLine={false} tick={{ fill: "#536875", fontSize: 11 }} tickFormatter={value => `${value} %`} allowDataOverflow />
        <Tooltip formatter={value => percent(Number(value))} labelFormatter={value => Number(value) === 0 ? "Actual" : `+${value} ciclos`} />
        {reference && domain[0] <= 80 && domain[1] >= 80 && <ReferenceLine y={80} stroke="#9aaea5" strokeDasharray="5 5" label={{ value: "80 %", position: "insideTopRight", fill: "#62716e", fontSize: 11 }} />}
        <Line dataKey="soh" name="SoH" type="linear" stroke="#178b78" strokeWidth={2} isAnimationActive={motion} animationDuration={900} connectNulls={false}
          dot={props => <circle key={props.payload.horizon} cx={props.cx} cy={props.cy} r={props.payload.horizon === selected.horizon ? 6 : 4} fill="#178b78" stroke="white" strokeWidth={2} style={{ cursor: "pointer" }} onClick={() => setHorizon(props.payload.horizon)} />} activeDot={{ r: 7 }} />
      </LineChart>
    </ResponsiveContainer></div></div>
    <div className="forecast-horizons" role="group" aria-label="Seleccionar horizonte">{data.map(point => <button key={point.horizon} type="button" aria-pressed={point.horizon === selected.horizon} aria-label={`${point.label}: ${percent(point.soh)}`} onClick={() => setHorizon(point.horizon)}><span>{point.label}</span></button>)}</div>
    <details className="forecast-reading-guide"><summary>Cómo interpretar la gráfica</summary><div className="chart-disclaimer"><p>Las líneas unen las estimaciones de los horizontes indicados. No predicen los ciclos intermedios. Una pendiente nula no demuestra ausencia de degradación.</p><p>La referencia del 80 % es orientativa: no certifica seguridad ni determina la vida útil.</p></div></details>
    <details className="chart-table"><summary>Consultar valores</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Valores de las predicciones"><table><caption className="sr-only">SoH por ciclo</caption><thead><tr><th scope="col">Ciclo</th><th scope="col">Horizonte</th><th scope="col">SoH</th></tr></thead><tbody>{data.map(point => <tr key={point.horizon}><td>{point.cycle}</td><td>{point.label}</td><td>{percent(point.soh)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
