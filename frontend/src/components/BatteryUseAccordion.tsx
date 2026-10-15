import { useId, useState } from "react";
import type { BatteryUse } from "../data/batterySecondLifeData";
import Icon from "./Icon";

export default function BatteryUseAccordion({ application }: { application: BatteryUse }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const icon = application.category === "Movilidad eléctrica" ? "battery" : application.category === "Almacenamiento energético" ? "solar" : application.category === "Respaldo y continuidad" ? "shield" : application.category === "Investigación y diagnóstico" ? "chart" : "grid";
  return <article className={`use-accordion${open ? " is-open" : ""}`}>
    <h4 className="use-accordion-heading"><button type="button" id={`${id}-trigger`} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
      <span className="use-icon"><Icon name={icon} /></span>
      <span className="use-card-copy"><span className="use-category">{application.category}</span><span className="use-card-title">{application.title}</span><span className="use-card-summary">{application.summary}</span><span className="use-evaluation-label">Sujeto a evaluación técnica</span></span>
      <svg className="use-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button></h4>
    <div className="use-panel-animation" inert={!open} aria-hidden={!open}>
      <div className="use-panel-clip"><div className="use-panel" id={`${id}-panel`} role="region" aria-labelledby={`${id}-trigger`}>
        <h5>¿En qué consiste y cómo funcionaría?</h5><p>{application.operation}</p>
        <h5>¿Por qué puede considerarse para este SoH?</h5><p>{application.sohConsideration}</p>
        <h5>Posibles escenarios de evaluación</h5><ul>{application.scenarios.map((scenario) => <li key={scenario}>{scenario}</li>)}</ul>
        <h5>Requisitos técnicos</h5><p>{application.requirements}</p>
        <h5>Limitaciones</h5><p>{application.limitations}</p>
      </div></div>
    </div>
  </article>;
}
