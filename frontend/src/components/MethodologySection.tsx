import { useId, useRef, useState } from "react";
import type { PredictionResponse } from "../types/prediction";
import { MethodologyVisual } from "./methodology/MethodologyVisuals";
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
    <p className="section-kicker">TECNOLOGÍA DETRÁS DEL ANÁLISIS</p>
    <h2 id="methodology-title">Cómo funciona nuestra IA</h2>
    <p className="ai-introduction">Conoce cómo entrenamos el modelo y cómo transforma las mediciones de tu batería en una estimación de salud, proyecciones futuras y posibles usos.</p>
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
          <ul>{step.points.map(point => <li key={point}>{point}</li>)}</ul>
        </div>
        <div className="ai-step-visual"><MethodologyVisual kind={step.visual} prediction={prediction} compact /></div>
      </div>
      <div className="ai-journey-controls"><button type="button" disabled={active === 0} onClick={() => select(active - 1)}><span aria-hidden="true">←</span> Anterior</button><span>{active + 1} / 6</span><button type="button" disabled={active === 5} onClick={() => select(active + 1)}>Siguiente <span aria-hidden="true">→</span></button></div>
    </div>
    <aside className="ai-limitations"><h3>Qué debes tener en cuenta</h3>
      <p>La precisión depende de la calidad y compatibilidad de los datos. Las proyecciones a 20 y 30 ciclos son experimentales; los resultados orientan una evaluación, no certifican la seguridad de la batería.</p>
    </aside>
    <p className="ai-visual-caption">Entrenado con datos experimentales de baterías del repositorio público de la NASA.</p>
    </div>
    </details>
    </div>
  </section>;
}
