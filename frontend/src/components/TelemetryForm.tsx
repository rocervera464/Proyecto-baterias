import Icon from "./Icon";
import TelemetryFileInsight from "./TelemetryFileInsight";
import { importTelemetryFile } from "../services/api";
import TelemetryInformationGuide from "./TelemetryInformationGuide";
import ManualTelemetryWizard from "./ManualTelemetryWizard";
import { emptyManualRow, validateManualTelemetry, manualImportOptions } from "../utils/manualTelemetry";
import type { ManualRow } from "../utils/manualTelemetry";
import {
  useState,
  useRef,
  useId,
} from "react";

import {
  convertTelemetryCsv,
  TELEMETRY_FIELDS,
} from "../utils/parseTelemetryCsv";

import type { CsvData } from "../utils/parseTelemetryCsv";

import type {
  TelemetryRequest,
  TelemetrySample,
} from "../types/telemetry";


interface TelemetryFormProps {
  onSubmit: (
    telemetry: TelemetryRequest,
    context?: { warnings: string[] },
  ) => Promise<boolean>;

  loading: boolean;
  onTelemetryChange?: () => void;
}


export default function TelemetryForm({
  onSubmit,
  loading: predicting,
  onTelemetryChange,
}: TelemetryFormProps) {

  const [identifying, setIdentifying] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [fileSize, setFileSize] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const loading = predicting || identifying;

  const [
    samples,
    setSamples,
  ] = useState<
    TelemetrySample[]
  >(
    [],
  );


  const [
    fileName,
    setFileName,
  ] = useState(
    "",
  );


  const [
    csvError,
    setCsvError,
  ] = useState<
    string | null
  >(
    null,
  );


  const [inputMode, setInputMode] = useState<"csv" | "manual">("csv");
  const [manualStep, setManualStep] = useState(0);
  const [manualRows, setManualRows] = useState<ManualRow[]>(() => [emptyManualRow(), emptyManualRow()]);
  const manual = validateManualTelemetry(manualRows);
  const activeSamples = inputMode === "manual" ? manual.samples : samples;
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [binaryFile, setBinaryFile] = useState<File | null>(null);
  const [backendSegments, setBackendSegments] = useState<{ id: string; label: string; samples: number }[]>([]);
  const [backendSegment, setBackendSegment] = useState("0");
  const [detectedSamples, setDetectedSamples] = useState(0);
  const [fileContext, setFileContext] = useState<Partial<Pick<TelemetryRequest, "cycle" | "measurement_level" | "chemistry">>>({});
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  async function applyImport(data: CsvData) {
    setAnalysisComplete(false);
    onTelemetryChange?.();
    setReadingFile(true);
    setSamples([]);
    setCsvError(null);
    setAnalysisStarted(false);
    setSubmitError(null);
    try {
      setSamples(convertTelemetryCsv(data, manualImportOptions));
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "No fue posible procesar el archivo.");
    } finally {
      setReadingFile(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) await loadFile(file);
  }

  async function loadFile(file: File | undefined) {
    if (loading || readingFile) return;
    setAnalysisComplete(false);
    onTelemetryChange?.();
    setFileSize(file?.size ?? 0);
    setSamples([]);
    setCsvData(null);
    setFileName(file?.name ?? "");
    setCsvError(null);
    setSheets([]); setSelectedSheet(""); setFileWarnings([]); setBinaryFile(null);
    setBackendSegments([]); setBackendSegment("0"); setDetectedSamples(0); setFileContext({});
    setAnalysisStarted(false);
    setSubmitError(null);
    if (!file) return;
    setReadingFile(true);
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error("El archivo supera 40 MB. Selecciona un tramo menor.");
      if (!/\.(csv|tsv|txt|json|xlsx?|parquet|mat)$/i.test(file.name)) throw new Error("Formato no soportado.");
      setBinaryFile(file);
      const imported = await importTelemetryFile(file);
      setSheets(imported.sheets); setSelectedSheet(imported.selected_sheet ?? ""); setFileWarnings(imported.warnings);
      setBackendSegments(imported.segments ?? []); setBackendSegment(imported.selected_segment ?? "0");
      setDetectedSamples(imported.telemetry?.samples_detected ?? imported.rows.length);
      setFileContext(imported.telemetry?.declared_context ?? {});
      if (imported.rows.length) { setCsvData(imported); await applyImport(imported); }
    } catch (error) {
      setCsvError(error instanceof DOMException ? "No se pudo leer el archivo. Vuelve a seleccionarlo desde tu equipo." : error instanceof Error ? error.message : "No fue posible leer el archivo.");
    } finally {
      setReadingFile(false);
    }
  }

  async function changeSheet(sheet: string) {
    if (!binaryFile || !sheet || loading || readingFile) return;
    setReadingFile(true); setCsvError(null); setSamples([]); setSelectedSheet(sheet);
    try {
      const imported = await importTelemetryFile(binaryFile, sheet);
      setFileWarnings(imported.warnings); setCsvData(imported);
      setBackendSegments(imported.segments ?? []); setBackendSegment(imported.selected_segment ?? "0");
      setDetectedSamples(imported.telemetry?.samples_detected ?? imported.rows.length);
      setFileContext(imported.telemetry?.declared_context ?? {});
      await applyImport(imported);
    } catch (error) { setCsvError(error instanceof Error ? error.message : "No se pudo leer la hoja."); }
    finally { setReadingFile(false); }
  }

  async function changeBackendSegment(segment: string) {
    if (!binaryFile || loading || readingFile) return;
    setReadingFile(true); setCsvError(null); setSamples([]); setBackendSegment(segment);
    try {
      const imported = await importTelemetryFile(binaryFile, selectedSheet || undefined, segment);
      setCsvData(imported); setFileWarnings(imported.warnings);
      setDetectedSamples(imported.telemetry?.samples_detected ?? imported.rows.length);
      setFileContext(imported.telemetry?.declared_context ?? {});
      await applyImport(imported);
    } catch (error) { setCsvError(error instanceof Error ? error.message : "No se pudo leer la descarga."); }
    finally { setReadingFile(false); }
  }

  function changeManualStep(step: number) {
    setManualStep(step);
  }

  function changeManualRows(rows: ManualRow[]) {
    setAnalysisComplete(false);
    onTelemetryChange?.();
    setManualRows(rows);
    setAnalysisStarted(false);
    setSubmitError(null);
  }

  function changeInputMode(mode: "csv" | "manual") {
    if (mode === inputMode) return;
    setAnalysisComplete(false);
    onTelemetryChange?.();
    setInputMode(mode);
    setCsvError(null);
    setSubmitError(null);
    setAnalysisStarted(false);
    if (mode === "csv" && csvData) void applyImport(csvData);
  }

  async function handleSubmit(
    event:
      React.FormEvent,
  ) {

    event.preventDefault();
    if (loading || readingFile || submitting.current) return;
    setSubmitError(null);
    if (inputMode === "manual" && manualStep !== 5) return;
    if (inputMode === "manual" && manual.error) { setSubmitError(manual.error); return; }

    if (
      activeSamples.length < 2
    ) {

      setCsvError(
        "Debes cargar un archivo CSV válido.",
      );

      return;
    }


    submitting.current = true;
    setAnalysisStarted(true);
    setIdentifying(true);
    try {
      const completed = await onSubmit({ ...(inputMode === "csv" ? fileContext : {}), discharge_samples: activeSamples }, { warnings: inputMode === "manual" ? manual.warnings : fileWarnings });
      setAnalysisComplete(completed);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No fue posible preparar los datos para el análisis.");
      window.requestAnimationFrame(() => document.getElementById("telemetria")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" }));
    } finally { submitting.current = false; setIdentifying(false); }
  }


  const samplesInWindow =
    samples.filter(
      (
        sample,
      ) =>
        sample.time_s <= 300,
    ).length;


  const readyToAnalyze = activeSamples.length >= 2 && !csvError;
  const stage = analysisComplete || predicting ? 2 : analysisStarted ? 1 : 0;
  const analysisActions = (inputMode === "csv" || manualStep === 5) && <div className="analysis-submit">
    {submitError && <p className="form-error analysis-feedback" role="alert">{submitError}</p>}
    <div className="analysis-next-step" role="status">
      <span className="analysis-next-icon"><Icon name={loading ? "clock" : readyToAnalyze ? "check" : "upload"} /></span>
      <div><strong>{identifying && !predicting ? "Preparando las señales" : predicting ? "Analizando tus mediciones" : analysisComplete ? "Tu análisis está disponible" : readyToAnalyze ? "Todo listo para empezar" : "Carga tu telemetría para continuar"}</strong>
        <p>{loading ? "Conserva esta página abierta mientras termina el análisis." : readyToAnalyze ? "Comprobaremos las señales y seleccionaremos el modelo compatible." : "Selecciona un archivo o arrástralo al área de carga."}</p>
      </div>
    </div>
    <button type="submit" aria-busy={loading} disabled={loading || readingFile || !readyToAnalyze || (inputMode === "manual" && !!manual.error)}>
      <span className="analysis-submit-icon">{loading ? <span className="analysis-submit-spinner" /> : <Icon name="battery" />}</span>
      <span className="analysis-submit-copy"><strong>{loading ? "Analizando batería…" : analysisComplete ? "Analizar de nuevo" : "Analizar y predecir"}</strong><span>{loading ? "Procesando la telemetría" : "Estimar la salud de la batería"}</span></span>
      <span className="analysis-submit-arrow"><Icon name="arrow" /></span>
    </button>
  </div>;

  return (
    <form
      className="telemetry-form telemetry-workspace"
      noValidate
      onChangeCapture={() => { if (submitError) setSubmitError(null); if (analysisComplete) { setAnalysisComplete(false); onTelemetryChange?.(); } }}
      aria-busy={loading || readingFile}
      onSubmit={
        handleSubmit
      }
    >

      <div className="analysis-columns">
<section data-reveal id="telemetria" className="telemetry-import" aria-labelledby="telemetry-import-title">
      <div className="telemetry-import-heading">
        <div>
          <p className="telemetry-eyebrow">ANÁLISIS DE BATERÍA</p>
          <h3 id="telemetry-import-title">Carga tus datos. Conoce tu batería.</h3>
          <p>De tus mediciones a una estimación de salud, paso a paso.</p>
        </div>
        <span className={`telemetry-status-pill${csvError ? " has-error" : readyToAnalyze ? " is-ready" : ""}`}><span />{loading ? "Análisis en curso" : readingFile ? "Leyendo archivo" : csvError ? "Revisa el archivo" : analysisComplete ? "Análisis completo" : readyToAnalyze ? "Telemetría lista" : "Esperando telemetría"}</span>
      </div>
      <ol className="telemetry-flow" aria-label="Etapas del análisis">{["Cargar telemetría", "Leer señales", "Estimar salud"].map((label, index) => <li key={label} className={`${index === stage ? "is-current" : ""}${index < stage || analysisComplete ? " is-complete" : ""}`} aria-current={index === stage && !analysisComplete ? "step" : undefined}><span>{index < stage || analysisComplete ? <Icon name="check" /> : index + 1}</span><strong>{label}</strong></li>)}</ol>

      <div className="telemetry-source-selector" role="group" aria-label="Método de ingreso de telemetría">
        <button type="button" aria-pressed={inputMode === "csv"} disabled={loading || readingFile} onClick={() => changeInputMode("csv")}>
          <span className="source-option-icon"><Icon name="upload" /></span>
          <span className="source-option-copy"><strong>Subir archivo</strong><span>CSV, Excel y otros formatos</span></span>
          <span className="source-option-check" aria-hidden="true"><Icon name="check" /></span>
        </button>
        <button type="button" aria-pressed={inputMode === "manual"} disabled={loading || readingFile} onClick={() => changeInputMode("manual")}>
          <span className="source-option-icon"><Icon name="edit" /></span>
          <span className="source-option-copy"><strong>Ingreso manual</strong><span>Escribe o pega tus mediciones</span></span>
          <span className="source-option-check" aria-hidden="true"><Icon name="check" /></span>
        </button>
      </div>
      {inputMode === "manual" && <TelemetryInformationGuide />}
      {inputMode === "manual" && <ManualTelemetryWizard rows={manualRows} onChange={changeManualRows} disabled={loading || readingFile} step={manualStep} onStepChange={changeManualStep} parameters={<p>El modelo utiliza solo tiempo, voltaje, corriente y temperatura. No necesitas completar datos del ensayo.</p>} parametersValid={true} parameterWarnings={[]} parameterSummary={[]} />}
      <div hidden={inputMode !== "csv"}>
      <fieldset className="csv-source-fields" disabled={inputMode !== "csv"}>
      {backendSegments.length > 1 && <div className="form-grid segment-selector"><label>Descarga que se analizará<select value={backendSegment} disabled={loading || readingFile} onChange={event => void changeBackendSegment(event.target.value)}>{backendSegments.map(segment => <option key={segment.id} value={segment.id}>{segment.label} · {segment.samples} muestras</option>)}</select></label></div>}
      <div className="telemetry-upload-layout"><div className="telemetry-upload-area">
      {sheets.length > 1 && <div className="form-grid binary-sheet-select"><label>Hoja o batería del archivo<select value={selectedSheet} disabled={readingFile || loading} onChange={(event) => void changeSheet(event.target.value)}><option value="" disabled>Selecciona una tabla</option>{sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select></label></div>}
      <label htmlFor={fileInputId} className={`file-upload${dragging ? " is-dragging" : ""}${fileName ? " has-file" : ""}${loading || readingFile ? " is-busy" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!loading && !readingFile) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length > 1) { setCsvError("Carga un solo archivo a la vez para no mezclar baterías o ensayos."); return; } void loadFile(event.dataTransfer.files[0]); }}>
        <span className="telemetry-upload-glyph"><Icon name={fileName ? "file" : "upload"} /></span>
        <span className="csv-upload-title">{readingFile ? "Preparando tu archivo…" : fileName ? fileName : dragging ? "Suelta tu archivo aquí" : "Arrastra aquí tu telemetría"}</span>
        <span className="csv-upload-description">{fileName ? `${fileName.split(".").at(-1)?.toUpperCase()} \u00b7 ${(fileSize / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} KB · ${samples.length ? `${detectedSamples.toLocaleString("es")} muestras detectadas` : "Archivo seleccionado"}` : "o selecciónala desde tu equipo"}</span>
        <span className="telemetry-select-file"><Icon name={fileName ? "upload" : "file"} />{fileName ? "Reemplazar archivo" : "Seleccionar archivo"}</span>
        <span className="telemetry-upload-formats">CSV · Excel · MAT · Parquet · TSV · TXT · JSON <span>Hasta 40 MB</span></span>

        <input
          type="file"
          ref={fileInput}
          id={fileInputId}
          className="telemetry-file-input"
          aria-label="Seleccionar archivo de telemetría"
          accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.mat,.parquet"
          aria-describedby="csv-status"
          aria-invalid={!!csvError}
          disabled={readingFile || loading}
          onChange={
            handleFileChange
          }
        />

      </label>
      {fileName && <div className="telemetry-file-toolbar"><span>{csvError ? "Comprueba el formato o reemplaza el archivo." : samples.length ? "Archivo preparado para el análisis" : sheets.length > 1 ? "Selecciona la hoja que quieres analizar" : "Esperando mediciones válidas"}</span><button type="button" disabled={loading || readingFile} onClick={() => { if (fileInput.current) fileInput.current.value = ""; void loadFile(undefined); }}><Icon name="close" />Quitar archivo</button></div>}
      <p id="csv-status" className="csv-status" role="status">{readingFile ? "Leyendo archivo…" : ""}</p>
      {csvError && <p className="form-error telemetry-file-error" role="alert">{csvError}</p>}
      </div><TelemetryFileInsight samples={samples} reading={readingFile} complete={analysisComplete} /></div>


      </fieldset>
      </div>
      {inputMode === "csv" && samples.length > 0 && <details className="csv-preview"><summary>Ver mediciones del archivo</summary>
        <div className="preview-heading"><h3 id="preview-title">Vista previa de telemetría</h3><span>{samplesInWindow} muestras para el análisis · primeras {Math.min(5, samples.length)} filas</span></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Vista previa del CSV. Desplázate para ver todas las columnas.">
          <table><thead><tr>{TELEMETRY_FIELDS.map((field) => <th key={field} scope="col">{field}</th>)}</tr></thead>
          <tbody>{samples.slice(0, 5).map((sample, index) => <tr key={index}>{TELEMETRY_FIELDS.map((field) => <td key={field}>{Number(sample[field].toFixed(4))}</td>)}</tr>)}</tbody></table>
        </div>
      </details>}
      {analysisActions}
      </section>
      </div>
    </form>
  );
}
