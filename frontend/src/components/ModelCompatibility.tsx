import type { Compatibility } from "../types/prediction";
import "./modelCompatibility.css";

export default function ModelCompatibility({ report, hasPrediction = true }: { report: Compatibility; hasPrediction?: boolean }) {
  const matches = report.status === "within_observed_ranges";
  return <aside className={`model-compatibility${matches ? " observed" : " exploratory"}`} role="note">
    <strong>{matches ? "Entrada dentro de los rangos observados" : hasPrediction ? "Estimación exploratoria" : "Telemetría importada · sin predicción en modo estricto"}</strong>
    <details className="compatibility-explanation">
    <summary>{matches ? "Ver detalles de compatibilidad" : hasPrediction ? "¿Por qué es una estimación exploratoria?" : "Ver por qué no se pudo realizar la predicción"}</summary>
    {report.model_description && <p>Modelo seleccionado: {report.model_description}.</p>}
    <p>{report.limitation}</p>
    {report.reasons.map((reason) => <p key={reason}>{reason}</p>)}
    {report.quality_warnings.map((warning) => <p key={warning}>{warning}</p>)}
    {report.reference_coverage && <p>Referencias del entrenamiento: {report.reference_coverage.min.toFixed(2)}–{report.reference_coverage.max.toFixed(2)} % de capacidad relativa. Esto no valida una precisión uniforme en todo ese intervalo.</p>}
    {!!report.feature_deviations.length && <details><summary>Variables fuera del rango de entrenamiento ({report.feature_deviations.length})</summary><div className="table-scroll" tabIndex={0}><table><thead><tr><th>Variable</th><th>Entrada</th><th>Mínimo observado</th><th>Máximo observado</th></tr></thead><tbody>{report.feature_deviations.map((deviation) => <tr key={deviation.feature}><td>{deviation.feature}</td><td>{deviation.value.toPrecision(5)}</td><td>{deviation.observed_min.toPrecision(5)}</td><td>{deviation.observed_max.toPrecision(5)}</td></tr>)}</tbody></table></div></details>}
    </details>
  </aside>;
}
