import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TELEMETRY_FIELDS } from "../utils/parseTelemetryCsv";
import { emptyManualRow, parseManualPaste, validateManualTelemetry } from "../utils/manualTelemetry";
import type { ManualRow } from "../utils/manualTelemetry";
import "./manualTelemetry.css";

const labels = { time_s: "Tiempo [s]", voltage_v: "Voltaje [V]", current_a: "Corriente [A]", temperature_c: "Temperatura [°C]" };
export default function ManualTelemetryEditor({ rows, onChange, disabled }: { rows: ManualRow[]; onChange: (rows: ManualRow[]) => void; disabled: boolean }) {
  const id = useId();
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const validation = validateManualTelemetry(rows);
  const append = (text: string) => {
    try {
      const records = parseManualPaste(text);
      const blank = rows.every((row) => TELEMETRY_FIELDS.every((field) => !row[field].trim()));
      onChange([...(blank ? [] : rows), ...records]); setPaste(""); setPasteError(null);
    } catch (error) { setPasteError(error instanceof Error ? error.message : "No se pudo pegar el bloque."); }
  };
  return <div className="manual-editor">
    <div className="manual-editor-heading"><div><h3>Ingresa tus mediciones</h3><p>Una fila por medición. Tiempo desde el inicio de la descarga; unidades: s, V, A y °C.</p></div><span>{rows.length} filas · {validation.inWindow} mediciones válidas en 0–300 s</span></div>
    <fieldset disabled={disabled} className="manual-fields"><legend className="sr-only">Mediciones manuales de descarga</legend>
      <div className="manual-row-header" aria-hidden="true"><span>Fila</span>{TELEMETRY_FIELDS.map((field) => <span key={field}>{labels[field]}</span>)}<span>Acción</span></div>
      {rows.map((row, index) => <div className="manual-row" key={index}>
        <strong className="manual-row-number">{index + 1}</strong>
        {TELEMETRY_FIELDS.map((field) => <label key={field}><span>{labels[field]}</span><input type="text" inputMode="decimal" autoComplete="off" value={row[field]} aria-label={`Fila ${index + 1}: ${labels[field]}`} aria-invalid={!!validation.errors[`${index}-${field}`]} aria-describedby={validation.errors[`${index}-${field}`] ? `${id}-${index}-${field}` : undefined} onChange={(event) => onChange(rows.map((item, i) => i === index ? { ...item, [field]: event.target.value } : item))} onPaste={(event) => { const text = event.clipboardData.getData("text"); if (text.includes("\n") || text.includes("\t")) { event.preventDefault(); append(text); } }} />{validation.errors[`${index}-${field}`] && <small id={`${id}-${index}-${field}`} className="field-error">{validation.errors[`${index}-${field}`]}</small>}</label>)}
        <button type="button" className="manual-remove" aria-label={`Eliminar fila ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index))}>Eliminar</button>
      </div>)}
      <div className="manual-actions"><button type="button" onClick={() => onChange([...rows, emptyManualRow()])}>+ Agregar medición</button><button type="button" onClick={() => setConfirmClear(true)} disabled={!rows.length}>Limpiar tabla</button></div>
      {confirmClear && <div className="manual-confirm" role="group" aria-label="Confirmar limpieza"><p>¿Eliminar todas las mediciones manuales? Esta acción no modifica el archivo CSV.</p><button type="button" onClick={() => { onChange([]); setConfirmClear(false); }}>Sí, limpiar</button><button type="button" onClick={() => setConfirmClear(false)}>Cancelar</button></div>}
      <details><summary>Pegar varias filas desde Excel o una tabla</summary><label className="manual-paste-label">Pega tiempo, voltaje, corriente y temperatura, en ese orden.<textarea rows={4} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={"0\t4,10\t-1\t25\n60\t4,00\t-1\t26"} /></label><button type="button" disabled={!paste.trim()} onClick={() => append(paste)}>Agregar filas pegadas</button><p>Se añaden al final; una tabla completamente vacía se reemplaza. No se borran mediciones existentes.</p></details>
      {pasteError && <p className="form-error" role="alert">{pasteError}</p>}
    </fieldset>
    <div className={validation.error ? "manual-validation" : "manual-validation is-valid"} role="status">{validation.error ?? `Telemetría válida: ${validation.samples.length} mediciones. Se usarán ${validation.inWindow} dentro de la ventana.`}</div>
    {!!validation.warnings.length && <div className="import-warnings">{validation.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
    <details><summary>¿Cómo ingresar correctamente la telemetría?</summary><p>Cada medición registra la respuesta de la misma batería en un instante: tiempo en segundos, voltaje en voltios, corriente en amperios y temperatura de la batería en grados Celsius.</p><p>El tiempo permite ordenar las mediciones y seleccionar los primeros 300 segundos, la ventana usada al entrenar los modelos. El voltaje describe la tensión eléctrica; la corriente, el flujo de carga y su signo; la temperatura, el comportamiento térmico.</p><p>Un valor aislado no permite resumir una evolución. El mínimo técnico es de dos mediciones en instantes distintos entre 0 y 300 s. No se exige una frecuencia fija ni llegar exactamente al segundo 300; cumplir el mínimo no garantiza precisión.</p><p><strong>Ejemplo ilustrativo, no incorporado al análisis:</strong> a los 0 s: 4,10 V, −1 A y 25 °C; a los 60 s: 4,00 V, −1 A y 26 °C. Introduce únicamente tus propias mediciones.</p></details>
    <section className="manual-preview" aria-labelledby={`${id}-preview`}><h3 id={`${id}-preview`}>Vista previa de telemetría</h3><p>Puntos reales ingresados y válidos; las filas incompletas no se dibujan. La zona verde indica 0–300 s. No se interpolan ni se generan mediciones.</p>
      {validation.preview.length ? <div className="manual-preview-grid">{(["voltage_v", "current_a", "temperature_c"] as const).map((field) => <figure key={field}><figcaption>{labels[field]} frente al tiempo</figcaption><div className="manual-preview-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={validation.preview} margin={{ top: 12, right: 12, left: 0, bottom: 12 }} accessibilityLayer><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time_s" type="number" domain={[0, Math.max(300, ...validation.preview.map((row) => row.time_s))]} tick={{ fontSize: 10 }} label={{ value: "Tiempo [s]", position: "insideBottom", offset: -8, fontSize: 10 }} /><YAxis width={42} domain={["auto", "auto"]} tick={{ fontSize: 10 }} /><ReferenceArea x1={0} x2={300} fill="#178b78" fillOpacity={0.07} /><ReferenceLine x={300} stroke="#178b78" strokeDasharray="3 4" /><Tooltip formatter={(value) => [String(value), labels[field]]} labelFormatter={(time) => `${time} s`} /><Line dataKey={field} stroke="#178b78" strokeWidth={0} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></div></figure>)}</div> : <p>Agrega una medición completa y válida para ver sus puntos.</p>}
    </section>
  </div>;
}
