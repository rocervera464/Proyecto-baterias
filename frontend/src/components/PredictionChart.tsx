import { useEffect, useId, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PredictionResponse } from "../types/prediction";
import "./predictionChart.css";

const percent = (value: number | null | undefined) => value != null && Number.isFinite(value)
  ? `${value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : "No disponible";

export default function PredictionChart({ prediction }: { prediction: PredictionResponse }) {
  const [zoom, setZoom] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [reference, setReference] = useState(true);
  const [horizon, setHorizon] = useState(0);
  const [replay, setReplay] = useState(0);
  const [motion, setMotion] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!chartRef.current) return;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !visible) { visible = true; setReplay((value) => value + 1); }
      else if (!entry.isIntersecting) visible = false;
    }, { threshold: 0.25 });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const data = [
    { cycle: prediction.current_cycle, soh: prediction.current_soh_percent, raw: prediction.raw_current_soh_percent, horizon: 0, experimental: false, label: "Actual" },
    ...prediction.future_predictions.map((item) => ({ cycle: item.target_cycle, soh: item.predicted_soh_percent, raw: item.raw_predicted_soh_percent, horizon: item.horizon_cycles, experimental: item.experimental, label: `+${item.horizon_cycles} ciclos` })),
  ].sort((a, b) => a.horizon - b.horizon).map((point) => ({ ...point, soh: Number.isFinite(point.soh) ? point.soh : null, raw: point.raw != null && Number.isFinite(point.raw) ? point.raw : null }));
  const selected = data.find((point) => point.horizon === horizon) ?? data[0];
  const values = data.flatMap((point) => [point.soh, ...(showRaw ? [point.raw] : [])]).filter((value): value is number => value != null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 100;
  const padding = Math.max(1, (max - min) * .3);
  const domain: [number, number] = zoom
    ? [Math.floor(min - padding), Math.ceil(max + padding)]
    : [Math.min(0, Math.floor(min / 10) * 10), Math.max(100, Math.ceil(max / 10) * 10)];
  const current = data[0].soh;
  const change = current != null && selected.soh != null ? selected.soh - current : null;
  const hasRaw = data.some((point) => point.raw != null);
  return <section data-reveal id="grafica" className="prediction-chart interactive-forecast" aria-labelledby={titleId}>
    <div className="chart-header"><div><p className="section-kicker">PROYECCIÓN INTERACTIVA</p><h3 id={titleId}>Evolución estimada del SoH</h3><p className="forecast-subtitle">Explora cada horizonte y compara cómo cambia la estimación.</p></div><span className="forecast-discrete-badge">{data.length} puntos de estimación</span></div>
    <div className="forecast-toolbar" aria-label="Opciones de la gráfica">
      <div className="forecast-scale" role="group" aria-label="Escala vertical"><button type="button" aria-pressed={!zoom} onClick={() => setZoom(false)}>Vista completa</button><button type="button" aria-pressed={zoom} onClick={() => setZoom(true)}>Ver detalle</button></div>
      <div className="forecast-toggles"><label><input type="checkbox" checked={reference} onChange={(event) => setReference(event.target.checked)} />Referencia del 80 %</label>{hasRaw && <label><input type="checkbox" checked={showRaw} onChange={(event) => setShowRaw(event.target.checked)} />Salidas originales</label>}<button className="forecast-replay" type="button" disabled={!motion} onClick={() => setReplay((value) => value + 1)} aria-label="Repetir animación de la gráfica">↻ Animar</button></div>
    </div>
    <div className="forecast-selected" aria-live="polite" aria-atomic="true"><div><span>{selected.label} · ciclo {selected.cycle}</span><strong>{percent(selected.soh)}</strong></div><div><span>Cambio frente al estado actual</span><strong className="forecast-delta">{change == null ? "No disponible" : `${change > 0 ? "+" : ""}${change.toLocaleString("es-CO", { maximumFractionDigits: 2 })} puntos`}</strong><small>{selected.experimental ? "Horizonte experimental" : selected.horizon === 0 ? "Estado actual estimado" : "Horizonte principal"}</small></div></div>
    {reference && (domain[0] > 80 || domain[1] < 80) && <p className="forecast-subtitle">La referencia del 80 % queda fuera de la escala ampliada. Usa la vista completa para verla.</p>}
    <div className="forecast-canvas" ref={chartRef}>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart key={`${prediction.current_cycle}-${prediction.current_soh_percent}-${replay}`} data={data} margin={{ top: 24, right: 22, left: 0, bottom: 20 }} accessibilityLayer>
            <CartesianGrid stroke="#dce8e3" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="cycle" type="number" domain={["dataMin", "dataMax"]} ticks={data.map((point) => point.cycle)} allowDecimals={false} axisLine={false} tickLine={false} tickMargin={12} tick={{ fill: "#536875", fontSize: 11 }} label={{ value: "Ciclo", position: "insideBottom", offset: -15, fill: "#536875" }} />
            <YAxis domain={domain} width={58} axisLine={false} tickLine={false} tickMargin={8} tick={{ fill: "#536875", fontSize: 11 }} tickFormatter={(value) => `${value} %`} allowDataOverflow />
            <Tooltip cursor={{ stroke: "#178b78", strokeWidth: 1, strokeDasharray: "4 4" }} content={({ active, payload }) => {
              const point = payload?.[0]?.payload as typeof selected | undefined;
              return active && point ? <div className="forecast-tooltip"><span>Ciclo {point.cycle} · {point.label}</span><strong>{percent(point.soh)}</strong>{showRaw && point.raw != null && <p>Original: {percent(point.raw)}</p>}<small>{point.experimental ? "Experimental · interpretar con cautela" : "SoH estimado"}</small></div> : null;
            }} />
            {reference && domain[0] <= 80 && domain[1] >= 80 && <ReferenceLine y={80} stroke="#9aaea5" strokeDasharray="5 5" label={{ value: "Referencia: 80 %", position: "insideTopRight", fill: "#62716e", fontSize: 11 }} />}
            <ReferenceLine x={selected.cycle} stroke="#178b7855" strokeDasharray="3 4" />
            {showRaw && <Line dataKey="raw" name="Salida original" type="linear" stroke="#9b661d" strokeWidth={2} strokeDasharray="3 5" dot={{ r: 3 }} activeDot={{ r: 6 }} isAnimationActive={motion} animationDuration={800} connectNulls={false} />}
            <Line dataKey="soh" name="SoH presentado" type="linear" stroke="#178b78" strokeWidth={3} strokeDasharray="6 4" isAnimationActive={motion} animationDuration={1100} animationEasing="ease-out" connectNulls={false}
              dot={(props) => {
                const point = props.payload as typeof selected;
                return <circle key={point.horizon} cx={props.cx} cy={props.cy} r={point.horizon === selected.horizon ? 7 : 5} fill={point.experimental ? "#a66a18" : "#178b78"} stroke="white" strokeWidth={3} style={{ cursor: "pointer" }} onClick={() => setHorizon(point.horizon)} />;
              }} activeDot={{ r: 8, stroke: "white", strokeWidth: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="forecast-legend"><span><i />SoH presentado</span><span><i className="experimental" />Punto experimental</span>{showRaw && <span><i className="original" />Salida original</span>}<span>{zoom ? "Escala ampliada · eje vertical recortado" : "Escala completa"}</span></div>
    </div>
    <div className="forecast-horizons" role="group" aria-label="Seleccionar horizonte">{data.map((point) => <button key={point.horizon} type="button" aria-pressed={point.horizon === selected.horizon} className={point.experimental ? "is-experimental" : ""} onClick={() => setHorizon(point.horizon)}><span>{point.label}</span><strong>{percent(point.soh)}</strong><small>{point.experimental ? "Experimental" : `Ciclo ${point.cycle}`}</small></button>)}</div>
    <div className="chart-disclaimer"><p>Selecciona un horizonte con los botones o un punto de la gráfica. Las líneas conectan estimaciones discretas: no representan una curva física ni predicen los ciclos intermedios.</p><p>La referencia del 80 % es orientativa. No determina seguridad, fin de vida útil ni ciclos restantes. Los horizontes +20 y +30 son experimentales.</p></div>
    <details className="chart-table"><summary>Consultar los valores de la gráfica</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="Valores de las predicciones"><table><caption className="sr-only">SoH por ciclo y horizonte de predicción</caption><thead><tr><th scope="col">Ciclo</th><th scope="col">Horizonte</th><th scope="col">SoH presentado</th><th scope="col">Salida original</th><th scope="col">Tipo</th></tr></thead><tbody>{data.map((point) => <tr key={point.horizon}><td>{point.cycle}</td><td>{point.label}</td><td>{percent(point.soh)}</td><td>{percent(point.raw)}</td><td>{point.experimental ? "Experimental" : point.horizon === 0 ? "Actual" : "Principal"}</td></tr>)}</tbody></table></div></details>
  </section>;
}
