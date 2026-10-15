import { useRef, useState } from "react";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { getForecastIncreases } from "../utils/forecastConsistency";
import PredictionChart from "../components/PredictionChart";
import BatteryUsageCard from "../components/BatteryUsageCard";
import TelemetryForm from "../components/TelemetryForm";
import MethodologySection from "../components/MethodologySection";
import Icon from "../components/Icon";
import { getBatteryUsage } from "../utils/batteryUsage";
import { predictBattery } from "../services/api";
import type { PredictionResponse } from "../types/prediction";
import type { TelemetryRequest } from "../types/telemetry";

const validSoh = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

export default function PredictionPage() {
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  async function handlePrediction(telemetry: TelemetryRequest, context?: { warnings: string[] }) {
    if (loading) return;
    setLoading(true); setError(null); setPrediction(null);
    setImportWarnings(context?.warnings ?? []);
    try { setPrediction(await predictBattery(telemetry)); }
    catch (error) { setError(error instanceof TypeError ? "No se pudo conectar con el servicio de predicción. Comprueba que el backend esté disponible." : error instanceof Error ? error.message : "Ocurrió un error inesperado."); }
    finally { setLoading(false); }
  }
  const soh = prediction?.current_soh_percent ?? NaN;
  const usage = getBatteryUsage(soh);
  const resultsRef = useRef<HTMLElement>(null);
  useScrollReveal(resultsRef, prediction);
  const increases = prediction ? getForecastIncreases(prediction) : [];
  return <div className="prediction-content">
    <section className="card analyzer" id="analizador" aria-label="Analizador de baterías">
      <TelemetryForm onSubmit={handlePrediction} loading={loading} />
    </section>
    {error && <section className="error-card" role="alert"><strong>No fue posible realizar el análisis</strong><p>{error}</p><p>Los datos ingresados se conservan. Revisa el mensaje y vuelve a intentarlo.</p></section>}
    <section ref={resultsRef} id="resultados" className="results" aria-labelledby="results-title" aria-busy={loading}>
      <div className="results-heading"><div><p className="section-kicker">RESULTADOS DEL ANÁLISIS</p><h2 id="results-title">Salud actual y proyección</h2></div>{prediction && <span className="badge">Ciclo {prediction.current_cycle} analizado</span>}</div>
      {prediction ? <>
        {importWarnings.length > 0 && <div className="import-warnings" role="note"><strong>Alcance de esta predicción</strong>{importWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        <div className="results-overview">
          <article data-reveal className="health-card" data-tone={!validSoh(soh) ? "neutral" : soh >= 80 ? "good" : soh >= 60 ? "caution" : "low"}>
            <h3>Estado de salud actual</h3>
            <div className="soh-gauge">
              <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="gauge-track" cx="100" cy="100" r="84" />{validSoh(soh) && <circle className="gauge-value" cx="100" cy="100" r="84" pathLength="100" strokeDasharray={`${soh} 100`} transform="rotate(-90 100 100)" />}</svg>
              <div><strong>{Number.isFinite(soh) ? soh.toFixed(2) : "—"}<small>{Number.isFinite(soh) ? "%" : ""}</small></strong><span>SoH estimado</span></div>
            </div>
            <span className="badge">{usage?.state ?? "Fuera del intervalo orientativo"}</span>
            {!validSoh(soh) && <p>El valor de la API está fuera de 0–100 %. No se representa en el indicador ni se le asigna una categoría de uso.</p>}
            <p>Estimación de salud para el ciclo {prediction.current_cycle}. El SoH no es un porcentaje de seguridad.</p>
          </article>
          <section className="forecast-section" aria-labelledby="forecast-title">
            <h3 id="forecast-title">Proyecciones futuras</h3><p className="panel-description">Estimaciones independientes para cada horizonte.</p>
            <div className="prediction-grid">{[5, 10, 20, 30].map((horizon) => {
              const item = prediction.future_predictions.find((item) => item.horizon_cycles === horizon);
              const experimental = item?.experimental ?? horizon >= 20;
              const increase = increases.find((change) => change.toHorizon === horizon);
              return <article data-reveal key={horizon} className={`prediction-card${experimental ? " experimental" : ""}`}>
                <span>+{horizon} ciclos</span><strong>{item && Number.isFinite(item.predicted_soh_percent) ? `${item.predicted_soh_percent.toFixed(2)}%` : "No disponible"}</strong>
                <small>{item ? `Ciclo ${item.target_cycle}` : "Sin predicción válida"}</small>
                <span className="forecast-label">{experimental ? "Experimental" : "Predicción principal"}</span>
                {experimental && <p>Menor estabilidad en validación. Interpretar con cautela.</p>}
                {increase && <p className="forecast-caution">Aumento de {increase.increase.toFixed(2)} puntos respecto {increase.fromHorizon === 0 ? "al estado actual" : `a +${increase.fromHorizon} ciclos`}. Revisar consistencia.</p>}
                {item && !validSoh(item.predicted_soh_percent) && <p>Fuera del intervalo orientativo de 0–100 %.</p>}
              </article>;
            })}</div>
          </section>
        </div>
        {increases.length > 0 && <aside className="import-warnings consistency-warning" role="note" data-reveal><strong>Las estimaciones no siguen una secuencia decreciente</strong><p>Se espera una tendencia de degradación con el uso, pero estos cinco modelos son independientes y no garantizan coherencia entre horizontes. Los aumentos estimados no demuestran recuperación de la batería. Se conservan los valores originales; +20 y +30 son experimentales.</p></aside>}
        <PredictionChart prediction={prediction} />
        <section data-reveal className="interpretation" aria-labelledby="interpretation-title"><Icon name="chart" /><div><h3 id="interpretation-title">Interpretación del resultado</h3><p>{usage ? `${usage.state} · rango orientativo ${usage.range}.` : "El resultado no se encuentra en el intervalo orientativo de 0–100 %. Revisa la predicción."} {validSoh(soh) && soh < 60 ? "Se recomienda una evaluación especializada antes de considerar reutilización o reciclaje." : "Estas categorías son orientativas y requieren evaluación técnica adicional."}</p></div></section>
        <BatteryUsageCard soh={soh} />
      </> : <div className="empty-results" role="status"><span className="empty-icon"><Icon name="chart" /></span><h3>{loading ? "Analizando la batería…" : "Tu análisis comienza con los datos"}</h3><p>{loading ? "Procesando la telemetría mediante los modelos predictivos." : "Carga la telemetría y ejecuta el análisis para ver el SoH actual, las cuatro proyecciones y su interpretación."}</p></div>}
    </section>
    <MethodologySection />
    <footer className="app-footer"><span>VoltScope · EV Battery Intelligence</span><span>Analítica científica para una energía más sostenible</span></footer>
  </div>;
}
