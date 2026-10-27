import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import "./predictionProgress.css";

const steps = [
  "Validar la telemetría",
  "Preparar las características",
  "Evaluar la compatibilidad",
  "Estimar la salud de la batería",
  "Preparar los resultados",
];

export default function PredictionProgress() {
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    const interval = window.setInterval(() => setActive(value => Math.min(value + 1, steps.length - 1)), 1800);
    return () => window.clearInterval(interval);
  }, []);

  return <section ref={panel} className="prediction-progress" aria-labelledby="prediction-progress-title">
    <div className="prediction-progress-heading">
      <span className="prediction-progress-orb" aria-hidden="true"><Icon name="battery" /></span>
      <div><p className="section-kicker">BATERIA ESTÁ ANALIZANDO</p><h3 id="prediction-progress-title">De tus mediciones a una predicción</h3></div>
      <span className="prediction-progress-dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
    <svg className="prediction-telemetry-animation" viewBox="0 0 600 160" fill="none" aria-hidden="true">
      <defs>
        <pattern id="telemetry-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" stroke="#178b78" strokeOpacity=".08" /></pattern>
      </defs>
      <rect width="600" height="160" rx="18" fill="url(#telemetry-grid)" />
      <g stroke="#a7cec0" strokeWidth="2">
        <path d="M30 45h155l35 35h30M30 115h155l35-35" />
        <path d="M354 80h40l35-35h140M394 80l35 35h140" />
      </g>
      <g className="telemetry-packets" stroke="#178b78" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 180">
        <path d="M30 45h155l35 35h30" /><path d="M30 115h155l35-35h30" />
        <path d="M354 80h40l35-35h140" /><path d="M354 80h40l35 35h140" />
      </g>
      <path className="telemetry-signal" d="M35 80h25l8-13 12 25 12-35 12 23h60" stroke="#178b78" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="246" y="43" width="104" height="74" rx="14" fill="#f2fbf7" stroke="#178b78" strokeWidth="3" />
      <rect x="351" y="66" width="8" height="28" rx="3" fill="#178b78" />
      {[0, 1, 2, 3].map(index => <rect key={index} className={`telemetry-cell telemetry-cell-${index}`} x={257 + index * 22} y="54" width="16" height="52" rx="4" fill="#178b78" />)}
      <path d="m302 62-13 21h12l-7 17 18-25h-13l3-13Z" fill="white" />
      <g stroke="#178b78" strokeWidth="2" strokeLinecap="round">
        <path d="M458 92V65m20 27V58m20 34V71m20 21V51m20 41V63" className="telemetry-bars" />
      </g>
    </svg>
    <ol className="prediction-progress-steps">
      {steps.map((step, index) => <li key={step} aria-current={index === active ? "step" : undefined} className={index === active ? "is-active" : index < active ? "is-explained" : ""}>
        <span className="prediction-step-number" aria-hidden="true">{index + 1}</span>
        <strong>{step}</strong>
        {index === active && <span className="prediction-step-pulse" aria-hidden="true" />}
      </li>)}
    </ol>
    <div className="prediction-progress-track" aria-hidden="true"><span /></div>
    <span className="prediction-progress-sr" role="status">{steps[active]}</span>
  </section>;
}
