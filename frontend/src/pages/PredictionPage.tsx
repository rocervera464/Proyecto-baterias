import BatteryHealthCard from "../components/BatteryHealthCard";
import PredictionProgress from "../components/PredictionProgress";
import { ANALYSIS_PRESENTATION_DURATION_MS } from "../utils/analysisPresentation";
import { useEffect, useRef, useState } from "react";
import PredictionChart from "../components/PredictionChart";
import BatteryUsageCard from "../components/BatteryUsageCard";
import TelemetryForm from "../components/TelemetryForm";
import MethodologySection from "../components/MethodologySection";
import Icon from "../components/Icon";
import { getBatteryUsage } from "../utils/batteryUsage";
import { CompatibilityError, predictBattery } from "../services/api";
import ModelCompatibility from "../components/ModelCompatibility";
import type { Compatibility } from "../types/prediction";
import type { PredictionResponse } from "../types/prediction";
import type { TelemetryRequest } from "../types/telemetry";

const validSoh = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

export default function PredictionPage({ onResultsChange }: { onResultsChange: (available: boolean) => void }) {
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compatibility, setCompatibility] = useState<Compatibility | null>(null);
  const [compatibilityMessage, setCompatibilityMessage] = useState("");
  const failurePanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!error && !compatibility) return;
    failurePanel.current?.focus({ preventScroll: true });
    failurePanel.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
  }, [error, compatibility]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [analysisSequence, setAnalysisSequence] = useState(0);
  const [analysisTelemetry, setAnalysisTelemetry] = useState<TelemetryRequest | null>(null);
  const [forecastView, setForecastView] = useState<"chart" | "cards">("cards");
  function clearPreviousAnalysis() {
    setPrediction(null); setError(null); setCompatibility(null); setCompatibilityMessage("");
    onResultsChange(false);
  }
  async function handlePrediction(telemetry: TelemetryRequest, context?: { warnings: string[] }): Promise<boolean> {
    if (loading) return false;
    setAnalysisTelemetry(telemetry);
    setForecastView("cards");
    setAnalysisSequence((sequence) => sequence + 1);
    setLoading(true); setError(null); setPrediction(null); setCompatibility(null); setCompatibilityMessage("");
    onResultsChange(false);
    setImportWarnings(context?.warnings ?? []);
    const startedAt = performance.now();
    try {
      const result = await predictBattery(telemetry);
      // Keep the explanatory sequence visible even when inference is fast.
      // This is presentation time, independent of the model's execution time.
      const remaining = Math.max(0, ANALYSIS_PRESENTATION_DURATION_MS - (performance.now() - startedAt));
      if (remaining > 0) await new Promise<void>(resolve => window.setTimeout(resolve, remaining));
      setPrediction(result);
      onResultsChange(true);
      return true;
    }
    catch (error) {
      if (error instanceof CompatibilityError) {
        setCompatibility(error.report);
        setCompatibilityMessage(error.message);
      } else {
        setError(error instanceof TypeError ? "No se pudo conectar con el servicio de predicción. Comprueba que el backend esté disponible." : error instanceof Error ? error.message : "Ocurrió un error inesperado.");
      }
      return false;
    }
    finally { setLoading(false); }
  }
  const soh = prediction?.current_soh_percent ?? NaN;
  const usage = getBatteryUsage(soh);
  return <div className="prediction-content">
    <section className="card analyzer" id="analizador" aria-label="Analizador de baterías"
      onChangeCapture={() => setCompatibility(null)}
      onDropCapture={() => setCompatibility(null)}
      onClickCapture={(event) => { if ((event.target as Element).closest("button")) setCompatibility(null); }}>
      <TelemetryForm onSubmit={handlePrediction} loading={loading} onTelemetryChange={clearPreviousAnalysis} />
    </section>
    {loading && analysisTelemetry && <PredictionProgress key={analysisSequence} telemetry={analysisTelemetry} />}
    {error && <section ref={failurePanel} tabIndex={-1} className="error-card" role="alert"><strong>No se pudo completar el análisis</strong><p>{error}</p></section>}
    {compatibility && <section ref={failurePanel} tabIndex={-1} role="alert" className="compatibility-recovery" aria-labelledby="compatibility-recovery-title">
      <h3 id="compatibility-recovery-title">{compatibility.status === "out_of_range" ? "Archivo leído · mediciones fuera del alcance del modelo" : "Revisa los datos del ensayo"}</h3>
      <p>{compatibilityMessage}</p>
      <details><summary>Ver detalles</summary><ModelCompatibility report={compatibility} hasPrediction={false} /></details>
      <a href="#telemetria">Revisar la telemetría cargada</a>
    </section>}
    <section id="resultados" className="results" aria-labelledby="results-title" aria-busy={loading}>
      <div data-reveal className="results-heading"><div><p className="section-kicker">RESULTADOS DEL ANÁLISIS</p><h2 id="results-title">Salud actual y proyección</h2></div>{prediction && <span className="badge">{prediction.current_cycle == null ? `${prediction.telemetry?.samples_used ?? ""} muestras analizadas` : `Ciclo ${prediction.current_cycle} analizado`}</span>}</div>
      {prediction ? <>
        {(prediction.compatibility || importWarnings.length > 0 || prediction.input_normalization?.length) && <details className="analysis-notes"><summary>Detalles del análisis</summary>{prediction.telemetry_reference && <p>Registro verificado: NASA {prediction.telemetry_reference.battery_id}, ciclo {prediction.telemetry_reference.cycle}.</p>}{prediction.input_normalization?.map((change, index) => <p key={index}>Normalización automática · {({ cycle: "Ciclo", ambient_temperature_c: "Temperatura ambiente", cutoff_voltage_v: "Voltaje de corte", measurement_level: "Nivel de medición", chemistry: "Química", time_s: "Tiempo", voltage_v: "Voltaje", current_a: "Corriente", temperature_c: "Temperatura" } as Record<string, string>)[change.field] ?? change.field}: {change.original_value !== undefined ? `${change.original_value} → ${change.normalized_value}` : "unidades corregidas"}.</p>)}{prediction.compatibility && <ModelCompatibility report={prediction.compatibility} />}{[...new Set(importWarnings)].map(note => <p key={note}>{note}</p>)}</details>}
        <div className="results-overview">
          <BatteryHealthCard key={analysisSequence} soh={soh} cycle={prediction.current_cycle} />
          <section id="proyecciones" className="forecast-section" aria-labelledby="forecast-title">
            <div className="forecast-results-heading"><div><h3 id="forecast-title">Proyecciones futuras</h3><p className="panel-description">{prediction.forecast_note ?? "Estimaciones a partir de tu telemetría."}</p></div><div className="forecast-results-switch" role="group" aria-label="Vista de las proyecciones"><button type="button" aria-pressed={forecastView === "cards"} aria-controls="forecast-results-view" onClick={() => setForecastView("cards")}><Icon name="grid" />Tarjetas</button><button type="button" aria-pressed={forecastView === "chart"} aria-controls="forecast-results-view" onClick={() => setForecastView("chart")}><Icon name="chart" />Gráfica</button></div></div>
            <div id="forecast-results-view">
            {forecastView === "chart" ? <PredictionChart prediction={prediction} embedded /> : prediction.future_predictions.length === 0 ? <div className="empty-results"><h3>Sin proyecciones habilitadas</h3><p>La validación disponible no respalda todavía horizontes futuros para este modelo. Se muestra únicamente el SoH actual.</p></div> : <div className="prediction-grid">{prediction.future_predictions.map(item => {
              return <article data-reveal key={item.horizon_cycles} className="prediction-card">
                <span>+{item.horizon_cycles} ciclos</span><strong>{item.predicted_soh_percent.toFixed(2)} %</strong>
                <small>{item.target_cycle == null ? `Dentro de ${item.horizon_cycles} ciclos` : `Ciclo ${item.target_cycle}`}</small>
                <span className="forecast-label">{item.validation_status === "research" ? "Proyección estimada" : "Horizonte validado"}</span>
              </article>;
            })}</div>}
            </div>
          </section>
        </div>
        <BatteryUsageCard key={analysisSequence} soh={soh} />
        <section data-reveal className="interpretation" aria-labelledby="interpretation-title"><Icon name="chart" /><div><h3 id="interpretation-title">Interpretación del resultado</h3><p>{usage ? `${usage.state} · rango orientativo ${usage.range}.` : soh > 100 ? "La estimación supera la capacidad de referencia inicial usada para definir el SoH. No representa el nivel de carga disponible." : "El resultado no se encuentra en el intervalo orientativo de clasificación."} {validSoh(soh) && soh < 60 ? "Se recomienda una evaluación especializada antes de considerar reutilización o reciclaje." : "Estas categorías son orientativas y requieren evaluación técnica adicional."}</p></div></section>
      </> : <div data-reveal className="empty-results" role="status"><span className="empty-icon"><Icon name="chart" /></span><h3>{loading ? "Analizando la batería…" : "Tu análisis comienza con los datos"}</h3><p>{loading ? "Procesando la telemetría mediante los modelos predictivos." : "Carga la telemetría y ejecuta el análisis para ver el SoH actual y las proyecciones disponibles."}</p></div>}
    </section>
    <MethodologySection prediction={prediction} />
    <footer data-reveal className="app-footer"><span>BaterIA · Inteligencia para tu batería</span><span>Analítica científica para una energía más sostenible</span></footer>
  </div>;
}
