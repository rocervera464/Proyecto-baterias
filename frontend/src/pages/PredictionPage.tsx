import BatteryHealthCard from "../components/BatteryHealthCard";
import { useState } from "react";
import { getForecastIncreases } from "../utils/forecastConsistency";
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
  const [blockedRequest, setBlockedRequest] = useState<TelemetryRequest | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [analysisSequence, setAnalysisSequence] = useState(0);
  async function handlePrediction(telemetry: TelemetryRequest, context?: { warnings: string[] }) {
    if (loading) return;
    setAnalysisSequence((sequence) => sequence + 1);
    setLoading(true); setError(null); setPrediction(null); setCompatibility(null); setBlockedRequest(null);
    onResultsChange(false);
    setImportWarnings(context?.warnings ?? []);
    try { setPrediction(await predictBattery(telemetry)); onResultsChange(true); }
    catch (error) {
      if (error instanceof CompatibilityError) {
        setCompatibility(error.report);
        setBlockedRequest(telemetry);
      } else {
        setError(error instanceof TypeError ? "No se pudo conectar con el servicio de predicción. Comprueba que el backend esté disponible." : error instanceof Error ? error.message : "Ocurrió un error inesperado.");
      }
    }
    finally { setLoading(false); }
  }
  const soh = prediction?.current_soh_percent ?? NaN;
  const exploratoryResult = prediction?.compatibility && !prediction.compatibility.can_estimate_in_strict_mode;
  const usage = getBatteryUsage(soh);
  const increases = prediction ? getForecastIncreases(prediction) : [];
  return <div className="prediction-content">
    <section className="card analyzer" id="analizador" aria-label="Analizador de baterías"
      onChangeCapture={() => { setBlockedRequest(null); setCompatibility(null); }}
      onDropCapture={() => { setBlockedRequest(null); setCompatibility(null); }}
      onClickCapture={(event) => { if ((event.target as Element).closest("button")) { setBlockedRequest(null); setCompatibility(null); } }}>
      <TelemetryForm onSubmit={handlePrediction} loading={loading} />
    </section>
    {error && <section className="error-card" role="alert"><strong>No fue posible realizar el análisis</strong><p>{error}</p><p>Los datos ingresados se conservan. Revisa el mensaje y vuelve a intentarlo.</p></section>}
    {compatibility && <section className="compatibility-recovery" aria-labelledby="compatibility-recovery-title">
      <h3 id="compatibility-recovery-title">Tu archivo se pudo leer; falta confirmar la compatibilidad</h3>
      <p>Estas mediciones no cumplen las condiciones del modo estricto. Puedes revisar los parámetros o realizar una prueba exploratoria con los datos actuales.</p>
      <ModelCompatibility report={compatibility} hasPrediction={false} />
      {blockedRequest && <>
        <p>La prueba exploratoria puede calcular un porcentaje, pero su precisión no está validada para estas condiciones. No confirma una degradación severa ni habilita recomendaciones de uso.</p>
        <button type="button" disabled={loading} onClick={() => void handlePrediction({ ...blockedRequest, analysis_mode: "exploratory" }, { warnings: importWarnings })}>Obtener estimación exploratoria</button>
        <a href="#parametros">Revisar los parámetros de la batería</a>
      </>}
    </section>}
    <section id="resultados" className="results" aria-labelledby="results-title" aria-busy={loading}>
      <div data-reveal className="results-heading"><div><p className="section-kicker">RESULTADOS DEL ANÁLISIS</p><h2 id="results-title">Salud actual y proyección</h2></div>{prediction && <span className="badge">Ciclo {prediction.current_cycle} analizado</span>}</div>
      {prediction ? <>
        {prediction.compatibility && <ModelCompatibility report={prediction.compatibility} />}
        {importWarnings.length > 0 && <div className="import-warnings" role="note"><strong>Alcance de esta predicción</strong>{importWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        <div className="results-overview">
          <BatteryHealthCard key={analysisSequence} soh={soh} cycle={prediction.current_cycle} rawSoh={prediction.raw_current_soh_percent} />
          <section id="proyecciones" className="forecast-section" aria-labelledby="forecast-title">
            <h3 id="forecast-title">Proyecciones futuras</h3><p className="panel-description">Proyecciones ajustadas a una tendencia de degradación no creciente.</p>
            <div className="prediction-grid">{[5, 10, 20, 30].map((horizon) => {
              const item = prediction.future_predictions.find((item) => item.horizon_cycles === horizon);
              const experimental = item?.experimental ?? horizon >= 20;
              const increase = increases.find((change) => change.toHorizon === horizon);
              return <article data-reveal key={horizon} className={`prediction-card${experimental ? " experimental" : ""}`}>
                <span>+{horizon} ciclos</span><strong>{item && Number.isFinite(item.predicted_soh_percent) ? `${item.predicted_soh_percent.toFixed(2)} %` : "No disponible"}</strong>
                <small>{item ? `Ciclo ${item.target_cycle}` : "Sin predicción válida"}</small>
                <span className="forecast-label">{experimental ? "Experimental" : "Predicción principal"}</span>
                {item?.adjusted && <p>Ajustada para mantener una tendencia de degradación coherente. Salida original: {item.raw_predicted_soh_percent?.toFixed(2)} %.</p>}
                {experimental && <p>Menor estabilidad en la validación. Interpreta el resultado con cautela.</p>}
                {increase && <p className="forecast-caution">Aumento de {increase.increase.toFixed(2)} puntos porcentuales respecto {increase.fromHorizon === 0 ? "al estado actual" : `a la estimación de +${increase.fromHorizon} ciclos`}. Revisa la consistencia.</p>}
                {item && !validSoh(item.predicted_soh_percent) && <p>Fuera del intervalo orientativo de 0–100 %.</p>}
              </article>;
            })}</div>
          </section>
        </div>
        {increases.length > 0 && <aside className="import-warnings consistency-warning" role="note" data-reveal><strong>Las estimaciones no siguen una secuencia decreciente</strong><p>Se espera una tendencia de degradación con el uso, pero estos cinco modelos son independientes y no garantizan coherencia entre horizontes. Los aumentos estimados no demuestran recuperación de la batería. Se conservan los valores originales; +20 y +30 son experimentales.</p></aside>}
        {exploratoryResult ? <section id="usos-bateria" className="import-warnings" role="note"><strong>Posibles usos pendientes de una evaluación compatible</strong><p>No se asignan recomendaciones de segunda vida a esta estimación exploratoria. Revisa el tipo de batería, las señales y las condiciones de entrenamiento.</p></section> : <BatteryUsageCard key={analysisSequence} soh={soh} />}
        <PredictionChart prediction={prediction} />
        <section data-reveal className="interpretation" aria-labelledby="interpretation-title"><Icon name="chart" /><div><h3 id="interpretation-title">Interpretación del resultado</h3><p>{usage ? `${usage.state} · rango orientativo ${usage.range}.` : "El resultado no se encuentra en el intervalo orientativo de 0–100 %. Revisa la predicción."} {validSoh(soh) && soh < 60 ? "Se recomienda una evaluación especializada antes de considerar reutilización o reciclaje." : "Estas categorías son orientativas y requieren evaluación técnica adicional."}</p></div></section>
      </> : <div data-reveal className="empty-results" role="status"><span className="empty-icon"><Icon name="chart" /></span><h3>{loading ? "Analizando la batería…" : "Tu análisis comienza con los datos"}</h3><p>{loading ? "Procesando la telemetría mediante los modelos predictivos." : "Carga la telemetría y ejecuta el análisis para ver el SoH actual, las cuatro proyecciones y su interpretación."}</p></div>}
    </section>
    <MethodologySection prediction={prediction} />
    <footer data-reveal className="app-footer"><span>BaterIA · Inteligencia para tu batería</span><span>Analítica científica para una energía más sostenible</span></footer>
  </div>;
}
