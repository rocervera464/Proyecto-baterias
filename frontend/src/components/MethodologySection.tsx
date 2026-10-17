import { useId, useRef, useState } from "react";
import type { PredictionResponse } from "../types/prediction";
import { FeatureExplorer, MethodologyVisual, TechnicalTerm } from "./methodology/MethodologyVisuals";
import { predictionSteps, trainingSteps } from "../data/methodologyData";
import "./methodology/methodology.css";

export default function MethodologySection({ prediction }: { prediction: PredictionResponse | null }) {
  const [mode, setMode] = useState<"prediction" | "training">("prediction");
  const [positions, setPositions] = useState({ prediction: 0, training: 0 });
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const steps = mode === "prediction" ? predictionSteps : trainingSteps;
  const active = positions[mode];
  const step = steps[active];
  const select = (index: number) => setPositions((previous) => ({ ...previous, [mode]: index }));
  return <section data-reveal className="methodology card" id="metodologia" aria-labelledby="methodology-title">
    <div className="ai-methodology">
    <details className="ai-disclosure">
    <summary className="ai-disclosure-heading">
    <div>
    <p className="section-kicker">CÓMO FUNCIONA NUESTRA IA</p>
    <h2 id="methodology-title">De la telemetría a la predicción: cómo funciona nuestra IA</h2>
    <p className="ai-introduction">Descubre lo que sabemos del entrenamiento y cómo BaterIA transforma los datos de descarga de una batería en estimaciones de su estado de salud.</p>
    </div>
    <svg className="ai-disclosure-chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </summary>
    <div className="ai-disclosure-content">
    <div className="ai-tabs" role="tablist" aria-label="Explorar desarrollo o predicción" onKeyDown={(event) => {
      const index = mode === "training" ? 0 : 1;
      const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : ["ArrowLeft", "ArrowRight"].includes(event.key) ? 1 - index : null;
      if (next === null) return;
      event.preventDefault(); setMode(next === 0 ? "training" : "prediction"); tabs.current[next]?.focus();
    }}>
      {(["training", "prediction"] as const).map((view, index) => <button key={view} ref={(element) => { tabs.current[index] = element; }} type="button" role="tab" id={`${id}-${view}-tab`} aria-selected={mode === view} tabIndex={mode === view ? 0 : -1} aria-controls={`${id}-${view}-panel`} onClick={() => setMode(view)}>{index === 0 ? "Cómo desarrollamos la IA" : "Cómo realizamos una predicción"}</button>)}
    </div>
    {(["training", "prediction"] as const).filter((view) => view !== mode).map((view) => <div key={view} role="tabpanel" hidden id={`${id}-${view}-panel`} aria-labelledby={`${id}-${view}-tab`} />)}
    <div role="tabpanel" tabIndex={0} id={`${id}-${mode}-panel`} aria-labelledby={`${id}-${mode}-tab`}>
      <nav className="ai-steps" aria-label={`Etapas de ${mode === "prediction" ? "predicción" : "desarrollo"}`}>
        {steps.map((item, index) => <button key={item.title} type="button" aria-current={active === index ? "step" : undefined} aria-controls={`${id}-step-content`} onClick={() => select(index)}><span>{String(index + 1).padStart(2, "0")}</span>{item.short}</button>)}
      </nav>
      <div className="ai-progress-label"><span aria-live="polite" aria-atomic="true">Etapa {active + 1} de 6 · {step.short}</span><span>{mode === "prediction" ? "Del archivo al resultado" : "De los datos al software"}</span></div>
      <progress className="ai-progress" value={active + 1} max={6} aria-label="Avance del recorrido" />
      <div className="ai-step-layout" id={`${id}-step-content`} key={`${mode}-${active}`}>
        <div className="ai-step-copy">
          <p className="section-kicker">{mode === "prediction" ? "PREDICCIÓN" : "DESARROLLO"} / {String(active + 1).padStart(2, "0")}</p>
          <h3>{step.title}</h3><p>{step.description}</p>
          <ul>{step.points.map((point) => <li key={point}>{point}</li>)}</ul>
          <div className="ai-evidence"><strong>{step.evidenceTitle}</strong><p>{step.evidence}</p></div>
          <details className="ai-technical"><summary>Explorar el detalle técnico</summary><p>{step.technical}</p></details>
          {step.visual === "features" && <FeatureExplorer />}
          {step.visual === "trees" && <p>Una <TechnicalTerm label="característica" description="Variable de entrada que resume una señal o condición de la batería." /> es una entrada; el <TechnicalTerm label="objetivo" description="Valor conocido durante el entrenamiento que se intenta estimar: SoH_percent." /> es lo que se quiere predecir.</p>}
        </div>
        <div className="ai-step-visual"><MethodologyVisual kind={step.visual} prediction={prediction} /></div>
      </div>
      <div className="ai-journey-controls"><button type="button" disabled={active === 0} onClick={() => select(active - 1)}><span aria-hidden="true">←</span> Anterior</button><span>{active + 1} / 6</span><button type="button" disabled={active === 5} onClick={() => select(active + 1)}>Siguiente <span aria-hidden="true">→</span></button></div>
    </div>
    <aside className="ai-limitations"><h3>Lo que una estimación no puede garantizar</h3>
      <p>La calidad de la telemetría y su compatibilidad con las condiciones de entrenamiento afectan la aplicabilidad. Los modelos se entrenaron con celdas NASA B0045–B0048; un paquete o una química diferente requiere validación propia.</p>
      <p>Los metadatos clasifican +20 y +30 como experimentales por menor estabilidad reportada en validación. No hay registros completos para verificarla de nuevo. No se publican aquí intervalos de confianza ni métricas no disponibles.</p>
      <p>Las salidas independientes pueden cruzarse. El backend actual aplica un ajuste isotónico no creciente: mejora la coherencia, sin demostrar mayor precisión. El SoH no certifica seguridad ni viabilidad de segunda vida. No existe un modelo formal de vida útil restante (RUL).</p>
    </aside>
    <details className="ai-sources"><summary>Fuentes y alcance de esta explicación</summary><ul><li>Artefactos del proyecto: <code>metadata.json</code>, <code>manifest.json</code> y <code>features.json</code>.</li><li>Implementación: <code>feature_engineering.py</code>, <code>model_service.py</code>, ruta <code>/api/v1/predict</code> e importador de telemetría.</li><li><code>docs/model-review.md</code> y <code>docs/model-audit.json</code>: coherencia y diagnóstico, sin evaluación independiente de precisión.</li><li><a href="https://xgboost.readthedocs.io/en/stable/tutorials/model.html" target="_blank" rel="noreferrer">Documentación oficial de XGBoost: árboles y aprendizaje aditivo</a>.</li></ul></details>
    </div>
    </details>
    </div>
  </section>;
}
