import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TELEMETRY_FIELDS } from "../utils/parseTelemetryCsv";
import { emptyManualRow, parseManualPaste, validateManualTelemetry } from "../utils/manualTelemetry";
import type { ManualRow } from "../utils/manualTelemetry";
import { getManualStepIssue } from "../utils/manualWizard";
import ManualTelemetryEditor from "./ManualTelemetryEditor";
import "./manualTelemetryWizard.css";

const steps = [
  { name: "Tiempo", title: "¿Cuándo se tomó cada medición?", description: "Ingresa los segundos transcurridos desde el inicio de la descarga. Usa al menos dos instantes distintos entre 0 y 300 s.", hint: "Busca Tiempo, Time o Elapsed time en el registro del equipo. Si tu registro comienza al iniciar la descarga, la primera lectura puede ser 0.", unit: "s", examples: ["0", "60"], label: "Tiempo desde el inicio" },
  { name: "Voltaje", title: "Agrega el voltaje de cada instante", description: "Copia el voltaje medido en los mismos instantes del paso anterior. Usa voltios (V), no el voltaje nominal de la etiqueta.", hint: "Busca Voltaje, Voltage o Tensión. Si el registro está en mV, divide entre 1000 antes de ingresarlo.", unit: "V", examples: ["4,10", "4,00"], label: "Voltaje medido" },
  { name: "Corriente", title: "Indica la corriente de descarga", description: "Ingresa la corriente de cada lectura en amperios (A). Conserva la correspondencia entre la medición y su tiempo.", hint: "Busca Corriente o Current en el mismo registro. Comprueba el signo de tu equipo: los modelos usan descarga negativa; no lo cambies sin verificarlo.", unit: "A", examples: ["-1,00", "-1,01"], label: "Corriente medida" },
  { name: "Temperatura", title: "Completa la temperatura de la batería", description: "Usa la temperatura registrada por el sensor de la batería en cada instante, expresada en grados Celsius.", hint: "Busca Temperatura de batería o Battery temperature. Es diferente de la temperatura del ambiente, que revisarás después.", unit: "°C", examples: ["25,0", "26,0"], label: "Temperatura medida" },
  { name: "Batería", title: "Revisa los datos de la batería", description: "Confirma el ciclo, la temperatura ambiente y el voltaje de corte de esta descarga. Completa los datos opcionales solo si los conoces.", hint: "Consulta la configuración o el informe del ensayo. Los valores supuestos permanecen identificados hasta que los confirmes o corrijas.", unit: "", examples: [], label: "" },
  { name: "Revisión", title: "Todo listo para revisar tu telemetría", description: "Comprueba las mediciones y los parámetros antes de iniciar la predicción. Puedes regresar a cualquier paso para corregirlos.", hint: "El análisis utiliza las mediciones dentro de los primeros 300 segundos y conserva los avisos sobre calidad y compatibilidad.", unit: "", examples: [], label: "" },
];

function StepAnimation({ step }: { step: number }) {
  return <svg className={`manual-wizard-illustration scene-${step}`} viewBox="0 0 300 160" fill="none" aria-hidden="true">
    <ellipse cx="150" cy="140" rx="90" ry="9" fill="#178b780d" />
    <circle className="wizard-orbit" cx="150" cy="75" r="63" stroke="#c6e1d5" strokeDasharray="4 9" />
    <rect x="93" y="43" width="110" height="66" rx="14" fill="#f3fbf7" stroke="#178b78" strokeWidth="2.5" />
    <rect x="205" y="63" width="7" height="26" rx="3" fill="#178b78" />
    {[0, 1, 2, 3].map(index => <rect key={index} className="wizard-battery-cell" style={{ animationDelay: `${index * .2}s` }} x={105 + index * 22} y="55" width="16" height="42" rx="4" fill="#178b78" />)}
    {step === 0 ? <g stroke="#123c4b" strokeWidth="2.5" strokeLinecap="round"><circle cx="223" cy="110" r="24" fill="white" /><path className="wizard-clock-hand" d="M223 94v16l10 6" /><path d="M215 82h16" /></g>
      : step === 3 ? <g stroke="#123c4b" strokeWidth="2.5"><path d="M224 77a7 7 0 0 0-14 0v29a14 14 0 1 0 14 0Z" fill="white" /><path className="wizard-temperature" d="M217 117V86" stroke="#d48367" strokeWidth="5" strokeLinecap="round" /><circle cx="217" cy="119" r="7" fill="#d48367" stroke="none" /></g>
        : step === 5 ? <g><circle cx="220" cy="112" r="24" fill="#178b78" /><path className="wizard-check" d="m207 112 9 9 17-19" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>
          : <path className="wizard-wave" d="M35 123h30l8-12 10 23 12-38 12 27h68l10-14 10 27 12-21 10 8h45" stroke="#178b78" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
    <path className="wizard-data-flow" d="M20 75h65m135 0h60" stroke="#178b78" strokeWidth="3" strokeDasharray="4 16" strokeLinecap="round" />
  </svg>;
}

interface Props {
  rows: ManualRow[];
  onChange: (rows: ManualRow[]) => void;
  disabled: boolean;
  step: number;
  onStepChange: (step: number) => void;
  parameters: ReactNode;
  parametersValid: boolean;
  parameterSummary: { label: string; value: string }[];
  parameterWarnings: string[];
}

export default function ManualTelemetryWizard({ rows, onChange, disabled, step, onStepChange, parameters, parametersValid, parameterSummary, parameterWarnings }: Props) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState<string[]>([]);
  const [attempted, setAttempted] = useState<number[]>([]);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const validation = validateManualTelemetry(rows);
  const current = steps[step];
  const field = step < 4 ? TELEMETRY_FIELDS[step] : null;
  const issue = step < 4 ? getManualStepIssue(rows, step) : step === 4 && !parametersValid ? "Revisa los parámetros: ciclo entero positivo, voltaje de corte mayor que cero y temperaturas numéricas válidas." : null;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [step]);

  function next() {
    if (disabled) return;
    setAttempted(values => values.includes(step) ? values : [...values, step]);
    if (issue) {
      window.requestAnimationFrame(() => panel.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"], input:invalid')?.focus());
      return;
    }
    onStepChange(Math.min(step + 1, 5));
  }

  function addRows() {
    setTouched([]); setAttempted([]);
    onChange([...rows, ...Array.from({ length: Math.max(1, 2 - rows.length) }, emptyManualRow)]);
    onStepChange(0);
  }

  function addPaste() {
    try {
      const parsed = parseManualPaste(paste);
      const blank = rows.every(row => TELEMETRY_FIELDS.every(key => !row[key].trim()));
      const combined = [...(blank ? [] : rows), ...parsed];
      onChange(combined); setPaste(""); setPasteError(null); setTouched([]); setAttempted([]);
      const firstIssue = [0, 1, 2, 3].find(index => getManualStepIssue(combined, index));
      onStepChange(firstIssue ?? 4);
    } catch (error) { setPasteError(error instanceof Error ? error.message : "No se pudo pegar el bloque."); }
  }

  return <div className="manual-wizard" ref={panel} aria-label="Asistente de ingreso manual" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement && step < 5) { event.preventDefault(); next(); } }}>
    <div className="manual-wizard-heading"><div><p className="section-kicker">INGRESO MANUAL GUIADO</p><h3>Carga tus datos paso a paso</h3></div><span>Paso {step + 1} de {steps.length}</span></div>
    <nav aria-label="Pasos del ingreso manual"><ol className="manual-wizard-steps">{steps.map((item, index) => <li key={item.name}><button type="button" disabled={disabled || index > step} aria-current={index === step ? "step" : undefined} onClick={() => onStepChange(index)}><span aria-hidden="true">{index < step ? "✓" : index + 1}</span>{item.name}</button></li>)}</ol></nav>
    <div className="manual-wizard-progress" aria-hidden="true"><span style={{ width: `${(step + 1) / steps.length * 100}%` }} /></div>
    <section className="manual-wizard-panel" key={step} aria-labelledby={`${id}-title`}>
      <div className="manual-wizard-intro"><div><p className="section-kicker">{step < 4 ? "MEDICIONES DE DESCARGA" : "PREPARACIÓN DEL ANÁLISIS"}</p><h3 ref={heading} tabIndex={-1} id={`${id}-title`}>{current.title}</h3><p>{current.description}</p></div><StepAnimation step={step} /></div>
      {field && <>
        <div className="manual-wizard-tip"><strong>Dónde encontrar este dato</strong><p>{current.hint}</p></div>
        <fieldset disabled={disabled} className="manual-wizard-fields"><legend className="sr-only">{current.label}</legend>
          {rows.length === 0 && <p>Agrega dos mediciones para comenzar.</p>}
          {rows.map((row, index) => {
            const key = `${index}-${field}`;
            const error = (touched.includes(key) || attempted.includes(step) || !!row[field].trim()) ? validation.errors[key] : undefined;
            return <div className="manual-wizard-reading" key={index}><div><strong>Medición {index + 1}</strong>{step > 0 && <span>Tiempo: {row.time_s || "sin definir"} s</span>}</div><label htmlFor={`${id}-${index}-${field}`}>{current.label}<div className="manual-wizard-input"><input id={`${id}-${index}-${field}`} type="text" inputMode="decimal" autoComplete="off" value={row[field]} placeholder={current.examples[index % 2]} aria-invalid={!!error} aria-describedby={error ? `${id}-${key}-error` : `${id}-example`} onBlur={() => setTouched(values => values.includes(key) ? values : [...values, key])} onChange={event => onChange(rows.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))} /><span>{current.unit}</span></div>{error && <small className="field-error" id={`${id}-${key}-error`}>{error}</small>}</label><button type="button" className="manual-wizard-remove" disabled={rows.length <= 2} aria-label={`Eliminar medición ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>Eliminar</button></div>;
          })}
          <p className="manual-wizard-example" id={`${id}-example`}>Ejemplos de formato: {current.examples.join(" y ")} {current.unit}. Son ilustrativos; ingresa tus propias mediciones. Se admiten decimales con coma o punto.</p>
          <button type="button" className="manual-wizard-add" onClick={addRows}>+ Agregar otra medición</button>
          {step === 0 && <details className="manual-wizard-paste"><summary>¿Ya tienes una tabla? Pega varias mediciones</summary><label>Cuatro columnas: tiempo [s], voltaje [V], corriente [A] y temperatura [°C].<textarea rows={4} value={paste} onChange={event => setPaste(event.target.value)} placeholder={"0\t4,10\t-1\t25\n60\t4,00\t-1\t26"} /></label><button type="button" disabled={!paste.trim()} onClick={addPaste}>Incorporar mediciones y continuar</button>{pasteError && <p className="form-error" role="alert">{pasteError}</p>}</details>}
        </fieldset>
      </>}
      {step === 4 && <><div className="manual-wizard-tip"><p>{current.hint}</p></div>{parameters}</>}
      {step === 5 && <>
        <div className="manual-wizard-summary"><span><strong>{validation.preview.length}</strong> mediciones completas</span><span><strong>{validation.inWindow}</strong> dentro de 0–300 s</span><span><strong>{validation.error ? "Por revisar" : "Lista"}</strong> telemetría para analizar</span></div>
        <dl className="manual-wizard-parameters">{parameterSummary.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Resumen de las primeras mediciones"><table><thead><tr><th>Tiempo [s]</th><th>Voltaje [V]</th><th>Corriente [A]</th><th>Temperatura [°C]</th></tr></thead><tbody>{rows.slice(0, 5).map((row, index) => <tr key={index}>{TELEMETRY_FIELDS.map(key => <td key={key}>{row[key] || "Pendiente"}</td>)}</tr>)}</tbody></table></div>
        {rows.length > 5 && <p>Se muestran las primeras 5 de {rows.length} mediciones. El análisis conserva todas las válidas dentro de la ventana.</p>}
        {validation.error && <p className="form-error" role="alert">{validation.error}</p>}
        {(parameterWarnings.length > 0 || validation.warnings.length > 0) && <details className="manual-wizard-notes"><summary>Revisar avisos y parámetros supuestos ({parameterWarnings.length + validation.warnings.length})</summary>{[...parameterWarnings, ...validation.warnings].map(warning => <p key={warning}>{warning}</p>)}</details>}
        <details className="manual-wizard-advanced"><summary>Editar la tabla completa o ver las gráficas</summary><ManualTelemetryEditor rows={rows} onChange={onChange} disabled={disabled} /></details>
        {!validation.error && parametersValid && <p className="manual-wizard-ready" role="status">Revisión completa. Pulsa «Analizar batería» para iniciar la predicción.</p>}
      </>}
      {attempted.includes(step) && issue && <p className="form-error" role="alert">{issue}</p>}
    </section>
    <div className="manual-wizard-controls"><button type="button" disabled={disabled || step === 0} onClick={() => onStepChange(step - 1)}>← Anterior</button><span role="status" aria-live="polite">{current.name} · {step + 1} / {steps.length}</span>{step < 5 && <button type="button" className="manual-wizard-next" disabled={disabled} onClick={next}>Continuar: {steps[step + 1].name.toLowerCase()} →</button>}</div>
  </div>;
}
