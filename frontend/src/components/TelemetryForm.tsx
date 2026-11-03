import { detectBatteryParameters } from "../utils/batteryParameters";
import { buildTelemetryRequest, identifyBatteryData } from "../utils/prepareTelemetryAnalysis";
import Icon from "./Icon";
import TelemetryFileInsight from "./TelemetryFileInsight";
import { identifyTelemetry, importTelemetryFile } from "../services/api";
import TelemetryInformationGuide from "./TelemetryInformationGuide";
import ManualTelemetryWizard from "./ManualTelemetryWizard";
import { emptyManualRow, validateManualTelemetry } from "../utils/manualTelemetry";
import type { ManualRow } from "../utils/manualTelemetry";
import {
  useState,
  useRef,
  useMemo,
  useId,
} from "react";

import {
  readTelemetryCsv,
  getDefaultImportOptions,
  getTelemetrySegments,
  getCycleColumns,
  isDischarge,
  getImportMetadata,
  convertTelemetryCsv,
  TELEMETRY_FIELDS,
} from "../utils/parseTelemetryCsv";

import type { CsvData, ImportOptions } from "../utils/parseTelemetryCsv";

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
    cycle,
    setCycle,
  ] = useState(
    "",
  );

  const [
    ambientTemperature,
    setAmbientTemperature,
  ] = useState(
    "",
  );

  const [
    cutoffVoltage,
    setCutoffVoltage,
  ] = useState(
    "",
  );


  const [
    reValue,
    setReValue,
  ] = useState(
    "",
  );

  const [
    rctValue,
    setRctValue,
  ] = useState(
    "",
  );


  const [
    chargeTempStart,
    setChargeTempStart,
  ] = useState(
    "",
  );

  const [
    chargeTempMax,
    setChargeTempMax,
  ] = useState(
    "",
  );

  const [
    chargeTempDelta,
    setChargeTempDelta,
  ] = useState(
    "",
  );


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
  const [measurementLevel, setMeasurementLevel] = useState<NonNullable<TelemetryRequest["measurement_level"]>>("unknown");
  const [chemistry, setChemistry] = useState<NonNullable<TelemetryRequest["chemistry"]>>("unknown");
  const [binaryFile, setBinaryFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [automaticSource, setAutomaticSource] = useState("");
  const [referenceLookupError, setReferenceLookupError] = useState("");
  const telemetrySegments = useMemo(() => csvData ? getTelemetrySegments(csvData, importOptions ?? undefined) : [], [csvData, importOptions]);
  const importMetadata = useMemo(() => csvData && importOptions ? getImportMetadata(csvData, importOptions) : null, [csvData, importOptions]);
  function applyBatteryParameters(detected: Record<string, string>, updateHistory = true) {
    setCycle(detected.cycle ?? ""); setAmbientTemperature(detected.ambient ?? ""); setCutoffVoltage(detected.cutoff ?? "");
    setMeasurementLevel((detected.level ?? "unknown") as typeof measurementLevel);
    setChemistry((detected.chemistry ?? "unknown") as typeof chemistry);
    if (!updateHistory) return;
    setReValue(detected.re ?? ""); setRctValue(detected.rct ?? "");
    setChargeTempStart(detected.chargeStart ?? ""); setChargeTempMax(detected.chargeMax ?? ""); setChargeTempDelta(detected.chargeDelta ?? "");
  }
  async function applyImport(data: CsvData, options: ImportOptions, updateParameters = false) {
    setAnalysisComplete(false);
    onTelemetryChange?.();
    setReadingFile(true);
    setImportOptions(options);
    setSamples([]);
    setCsvError(null);
    setAutomaticSource("");
    setReferenceLookupError("");
    setAnalysisStarted(false);
    setSubmitError(null);
    applyBatteryParameters({}, updateParameters);
    try {
      setSamples(convertTelemetryCsv(data, options));
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
    setImportOptions(null);
    setFileName(file?.name ?? "");
    setCsvError(null);
    setSheets([]); setSelectedSheet(""); setFileWarnings([]); setBinaryFile(null);
    applyBatteryParameters({});
    setAnalysisStarted(false);
    setSubmitError(null);
    setAutomaticSource("");
    setReferenceLookupError("");
    if (!file) return;
    setMeasurementLevel("unknown"); setChemistry("unknown");
    setReadingFile(true);
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error("El archivo supera 40 MB. Selecciona un tramo menor.");
      if (/\.(xlsx?|parquet|mat)$/i.test(file.name)) {
        setBinaryFile(file);
        const imported = await importTelemetryFile(file);
        setSheets(imported.sheets); setSelectedSheet(imported.selected_sheet ?? ""); setFileWarnings(imported.warnings);
        if (imported.rows.length) { setCsvData(imported); await applyImport(imported, getDefaultImportOptions(imported), true); }
        return;
      }
      if (!/\.(csv|tsv|txt|json)$/i.test(file.name)) throw new Error("Formato no soportado. Usa CSV, TSV, TXT, JSON, XLSX, XLS, MAT o Parquet.");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
      const data = readTelemetryCsv(new TextDecoder(encoding).decode(buffer));
      if (data.rows.length > 100_000) throw new Error("El archivo supera 100 000 filas. Selecciona un tramo menor.");
      setCsvData(data);
      await applyImport(data, getDefaultImportOptions(data), true);
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
      await applyImport(imported, getDefaultImportOptions(imported), true);
    } catch (error) { setCsvError(error instanceof Error ? error.message : "No se pudo leer la hoja."); }
    finally { setReadingFile(false); }
  }

  function changeManualStep(step: number) {
    setManualStep(step);
  }

  function changeManualRows(rows: ManualRow[]) {
    setAnalysisComplete(false);
    onTelemetryChange?.();
    setManualRows(rows);
    applyBatteryParameters({}, false);
    setAutomaticSource("");
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
    setAutomaticSource("");
    setReferenceLookupError("");
    setAnalysisStarted(false);
    applyBatteryParameters({}, false);
    if (mode === "csv" && csvData && importOptions) void applyImport(csvData, importOptions, true);
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
    setReferenceLookupError("");
    try {
      const declared = inputMode === "csv" && csvData && importOptions ? detectBatteryParameters(csvData, importOptions) : {};
      const edited = Object.fromEntries(Object.entries({
        cycle, ambient: ambientTemperature, cutoff: cutoffVoltage, level: measurementLevel, chemistry,
        ...(inputMode === "csv" ? { re: reValue, rct: rctValue, chargeStart: chargeTempStart, chargeMax: chargeTempMax, chargeDelta: chargeTempDelta } : {}),
      }).filter(([, value]) => value.trim() && value !== "unknown"));
      const resolved = await identifyBatteryData(activeSamples, { ...declared, ...edited }, identifyTelemetry);
      applyBatteryParameters(resolved.parameters, inputMode === "csv");
      let source = "";
      if (resolved.identity?.matched && resolved.identity.reference) {
        source = `Registro identificado: NASA ${resolved.identity.reference.battery_id}, ciclo ${resolved.identity.reference.cycle}. Datos del ensayo completados automáticamente.`;
      } else if (Object.keys(declared).length) {
        source = "Datos del ensayo identificados en el archivo.";
      }
      setAutomaticSource(source);
      const lookupWarning = resolved.lookupFailed ? "La identificación de referencias no está disponible. Se conservan los datos declarados del ensayo." : "";
      setReferenceLookupError(lookupWarning);
      if (inputMode === "csv") setSamples(resolved.samples);
      else if (resolved.identity?.matched) setManualRows(resolved.samples.map(sample => ({
        time_s: String(sample.time_s), voltage_v: String(sample.voltage_v), current_a: String(sample.current_a), temperature_c: String(sample.temperature_c),
      })));
      // Build from this analysis result, without waiting for React state updates.
      const telemetry = buildTelemetryRequest(resolved.parameters, resolved.samples);
      const completed = await onSubmit(telemetry, { warnings: [
        ...(inputMode === "manual" ? manual.warnings : [...fileWarnings, ...(source ? [source] : importMetadata?.warnings ?? [])]),
        ...(lookupWarning ? [lookupWarning] : []),
      ] });
      setAnalysisComplete(completed);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No fue posible preparar los datos para el análisis.");
      window.requestAnimationFrame(() => document.getElementById("parametros")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" }));
    } finally { submitting.current = false; setIdentifying(false); }
  }


  const parameterValues: Record<string, string> = {
    cycle, ambient: ambientTemperature, cutoff: cutoffVoltage,
    level: measurementLevel, chemistry,
  };
  function hasValidParameter(key: string) {
    const value = parameterValues[key].trim();
    if (!value || value === "unknown") return false;
    if (key === "level" || key === "chemistry") return true;
    const number = Number(value);
    return Number.isFinite(number) && (key !== "cycle" || (Number.isInteger(number) && number >= 1)) && (key !== "cutoff" || number > 0);
  }
  const parameterWarnings = [
    ...(!hasValidParameter("cycle") ? ["Completa el ciclo con un número entero mayor que cero."] : []),
    ...(!hasValidParameter("ambient") ? ["Completa la temperatura ambiente con un valor válido."] : []),
    ...(!hasValidParameter("cutoff") ? ["Completa el voltaje de corte con un valor mayor que cero."] : []),
    ...(!hasValidParameter("level") ? ["Identifica si las mediciones son de una celda, módulo o paquete."] : []),
    ...(!hasValidParameter("chemistry") ? ["Declara la química de la batería para comprobar la compatibilidad."] : []),
  ];

  const samplesInWindow =
    samples.filter(
      (
        sample,
      ) =>
        sample.time_s <= 300,
    ).length;


  const parameterFields = (keys?: string[]) => <div className="form-grid">
    {(!keys || keys.includes("cycle")) && <label>Ciclo de descarga<input type="number" min="1" step="1" required placeholder="Ciclo actual" value={cycle} onChange={event => { setCycle(event.target.value); }} /></label>}
    {(!keys || keys.includes("ambient")) && <label>Temperatura ambiente (°C)<input type="number" step="any" required value={ambientTemperature} onChange={event => { setAmbientTemperature(event.target.value); }} /></label>}
    {(!keys || keys.includes("cutoff")) && <label>Voltaje de corte (V)<input type="number" step="any" required value={cutoffVoltage} onChange={event => { setCutoffVoltage(event.target.value); }} /></label>}
    {(!keys || keys.includes("level")) && <label>Nivel de medición<select value={measurementLevel} onChange={event => { setMeasurementLevel(event.target.value as typeof measurementLevel); }}><option value="unknown">Selecciona una opción</option><option value="cell">Celda</option><option value="module">Módulo</option><option value="pack">Paquete</option></select></label>}
    {(!keys || keys.includes("chemistry")) && <label>Química<select value={chemistry} onChange={event => { setChemistry(event.target.value as typeof chemistry); }}><option value="unknown">Selecciona una opción</option><option value="li-ion">Ion litio</option><option value="LFP">LFP</option><option value="lead-acid">Plomo ácido</option><option value="other">Otra</option></select></label>}
  </div>;
  const batteryParameters = (
      <fieldset className="battery-context battery-context-analysis" id="parametros" disabled={loading || readingFile} aria-busy={identifying && !predicting}>
        <legend>Datos de la batería</legend>
        {identifying && !predicting && <p role="status">Identificando los datos del ensayo…</p>}
        {automaticSource && <p role="status">{automaticSource}</p>}
        {referenceLookupError && <p>{referenceLookupError}</p>}
        {parameterFields()}
      </fieldset>
  );

  const readyToAnalyze = activeSamples.length >= 2 && !csvError;
  const needsContext = analysisStarted && !loading && !["cycle", "ambient", "cutoff", "level", "chemistry"].every(hasValidParameter);
  const stage = analysisComplete || predicting ? 2 : analysisStarted ? 1 : 0;
  const analysisActions = (inputMode === "csv" || manualStep === 5) && <div className="analysis-submit">
    {submitError && <p className="form-error analysis-feedback" role="alert">{submitError}</p>}
    <div className="analysis-next-step" role="status">
      <span className="analysis-next-icon"><Icon name={loading ? "clock" : needsContext ? "edit" : readyToAnalyze ? "check" : "upload"} /></span>
      <div><strong>{identifying && !predicting ? "Identificando los datos de la batería" : predicting ? "Analizando tus mediciones" : analysisComplete ? "Tu análisis está disponible" : needsContext ? "Completa los datos de la batería" : readyToAnalyze ? "Todo listo para empezar" : "Carga tu telemetría para continuar"}</strong>
        <p>{loading ? "Conserva esta página abierta mientras termina el análisis." : needsContext ? "Tus mediciones se conservan. Solo faltan los datos indicados arriba." : readyToAnalyze ? "Identificaremos la batería y comprobaremos el modelo antes de predecir." : "Selecciona un archivo o arrástralo al área de carga."}</p>
      </div>
    </div>
    <button type="submit" aria-busy={loading} disabled={loading || readingFile || !readyToAnalyze || (inputMode === "manual" && !!manual.error)}>
      <span className="analysis-submit-icon">{loading ? <span className="analysis-submit-spinner" /> : <Icon name="battery" />}</span>
      <span className="analysis-submit-copy"><strong>{loading ? "Analizando batería…" : analysisComplete ? "Analizar de nuevo" : "Analizar batería"}</strong><span>{loading ? "Procesando la telemetría" : "Estimar la salud de la batería"}</span></span>
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
        <span className={`telemetry-status-pill${csvError || needsContext ? " has-error" : readyToAnalyze ? " is-ready" : ""}`}><span />{loading ? "Análisis en curso" : readingFile ? "Leyendo archivo" : csvError ? "Revisa el archivo" : analysisComplete ? "Análisis completo" : needsContext ? "Datos por completar" : readyToAnalyze ? "Telemetría lista" : "Esperando telemetría"}</span>
      </div>
      <ol className="telemetry-flow" aria-label="Etapas del análisis">{["Cargar telemetría", "Identificar batería", "Obtener predicción"].map((label, index) => <li key={label} className={`${index === stage ? "is-current" : ""}${index < stage || analysisComplete ? " is-complete" : ""}`} aria-current={index === stage && !analysisComplete ? "step" : undefined}><span>{index < stage || analysisComplete ? <Icon name="check" /> : index + 1}</span><strong>{label}</strong></li>)}</ol>

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
      {inputMode === "manual" && <ManualTelemetryWizard rows={manualRows} onChange={changeManualRows} disabled={loading || readingFile} step={manualStep} onStepChange={changeManualStep} parameters={<p>Al pulsar «Analizar batería», se identificarán los datos del ensayo y se completarán los campos disponibles.</p>} parametersValid={true} parameterWarnings={analysisStarted ? parameterWarnings : []} parameterSummary={analysisStarted ? [
        { label: "Ciclo", value: cycle },
        { label: "Temperatura ambiente", value: `${ambientTemperature} \u00b0C` },
        { label: "Voltaje de corte", value: `${cutoffVoltage} V` },
        { label: "Nivel", value: ({ unknown: "Desconocido", cell: "Celda", module: "M\u00f3dulo", pack: "Paquete" })[measurementLevel] },
        { label: "Qu\u00edmica", value: ({ unknown: "Desconocida", "li-ion": "Ion litio", LFP: "LFP", "lead-acid": "Plomo \u00e1cido", other: "Otra" })[chemistry] },

      ] : []} />}
      <div hidden={inputMode !== "csv"}>
      <fieldset className="csv-source-fields" disabled={inputMode !== "csv"}>
      <div className="telemetry-upload-layout"><div className="telemetry-upload-area">
      {sheets.length > 1 && <div className="form-grid binary-sheet-select"><label>Hoja o batería del archivo<select value={selectedSheet} disabled={readingFile || loading} onChange={(event) => void changeSheet(event.target.value)}><option value="" disabled>Selecciona una tabla</option>{sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select></label></div>}
      <label htmlFor={fileInputId} className={`file-upload${dragging ? " is-dragging" : ""}${fileName ? " has-file" : ""}${loading || readingFile ? " is-busy" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!loading && !readingFile) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length > 1) { setCsvError("Carga un solo archivo a la vez para no mezclar baterías o ensayos."); return; } void loadFile(event.dataTransfer.files[0]); }}>
        <span className="telemetry-upload-glyph"><Icon name={fileName ? "file" : "upload"} /></span>
        <span className="csv-upload-title">{readingFile ? "Preparando tu archivo…" : fileName ? fileName : dragging ? "Suelta tu archivo aquí" : "Arrastra aquí tu telemetría"}</span>
        <span className="csv-upload-description">{fileName ? `${(fileSize / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} KB · ${samples.length ? `${samples.length.toLocaleString("es")} muestras leídas` : "Archivo seleccionado"}` : "o selecciónala desde tu equipo"}</span>
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

      {inputMode === "csv" && csvData && importOptions && (
        <div className="csv-configuration">
        {telemetrySegments.length > 1 && <div className="form-grid segment-selector"><label>
          Descarga que se analizará
          <select value={importOptions.segmentId ?? ""} disabled={loading || readingFile} onChange={(event) => applyImport(csvData, { ...importOptions, segmentId: event.target.value }, true)}>
            {telemetrySegments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label} · {segment.rows.length} muestras</option>)}
          </select>
        </label></div>}
        <details className="csv-settings" key={fileName} open={samples.length === 0}>
          <summary>Opciones avanzadas</summary>
        <fieldset className="csv-mapping" disabled={loading || readingFile}>
          <legend>Lectura del archivo</legend>
          <div className="form-grid"><label>Columna de ciclo<select value={importOptions.cycleColumn ?? ""} onChange={event => {
            const next = { ...importOptions, cycleColumn: event.target.value || undefined };
            const segments = getTelemetrySegments(csvData, next);
            next.segmentId = (segments.find(segment => isDischarge(segment.mode)) ?? segments[0])?.id;
            applyImport(csvData, next, true);
          }}><option value="">{getCycleColumns(csvData).length > 1 ? "Selecciona el contador correcto" : "Automática"}</option>{csvData.fields.map(column => <option key={column} value={column}>{column}</option>)}</select></label></div>
          <h4 className="csv-group-title">1. Asigna las columnas</h4>
          <div className="form-grid csv-fields-grid">
            {TELEMETRY_FIELDS.map((field) => (
              <label key={field}>
                {{ time_s: "Tiempo", voltage_v: "Voltaje", current_a: "Corriente", temperature_c: "Temperatura" }[field]}
                <select value={importOptions.mapping[field]} onChange={(event) => applyImport(csvData, {
                  ...importOptions,
                  mapping: { ...importOptions.mapping, [field]: event.target.value },
                })}>
                  <option value="">Selecciona una columna</option>
                  {csvData.fields.map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
              </label>
            ))}
          </div>
          <h4 className="csv-group-title">2. Confirma las unidades</h4>
          <div className="form-grid csv-fields-grid">
            <label>
              Unidad del tiempo
              <select value={importOptions.timeUnit} onChange={(event) => applyImport(csvData, {
                ...importOptions, timeUnit: event.target.value as ImportOptions["timeUnit"],
              })}>
                <option value="s">Segundos</option><option value="ms">Milisegundos</option>
                <option value="min">Minutos</option><option value="h">Horas</option><option value="d">Días (incluidas fracciones)</option><option value="clock">Duración HH:MM:SS</option>
                <option value="datetime">Fecha y hora ISO</option>
              </select>
            </label>
            <label>
              Unidad del voltaje
              <select value={importOptions.voltageUnit} onChange={(event) => applyImport(csvData, {
                ...importOptions, voltageUnit: event.target.value as ImportOptions["voltageUnit"],
              })}><option value="V">Voltios (V)</option><option value="mV">Milivoltios (mV)</option></select>
            </label>
            <label>
              Unidad de la corriente
              <select value={importOptions.currentUnit} onChange={(event) => applyImport(csvData, {
                ...importOptions, currentUnit: event.target.value as ImportOptions["currentUnit"],
              })}><option value="A">Amperios (A)</option><option value="mA">Miliamperios (mA)</option></select>
            </label>
            <label>
              Unidad de la temperatura
              <select value={importOptions.temperatureUnit} onChange={(event) => applyImport(csvData, {
                ...importOptions, temperatureUnit: event.target.value as ImportOptions["temperatureUnit"],
              })}><option value="C">Celsius (°C)</option><option value="F">Fahrenheit (°F)</option><option value="K">Kelvin (K)</option></select>
            </label>
          </div>
          <h4 className="csv-group-title">3. Adaptación del paquete y signo de la corriente</h4>
          <div className="form-grid csv-fields-grid">
            <label>Divisor de voltaje · celdas en serie
              <input type="number" min="1" step="1" value={importOptions.seriesCells ?? 1} onChange={(event) => applyImport(csvData, { ...importOptions, seriesCells: Number(event.target.value) })} />
            </label>
            <label>Divisor de corriente · ramas en paralelo
              <input type="number" min="1" step="1" value={importOptions.parallelStrings ?? 1} onChange={(event) => applyImport(csvData, { ...importOptions, parallelStrings: Number(event.target.value) })} />
            </label>
          </div>
          <p className="csv-window-note">Usa divisores distintos de 1 solo si conoces la configuración del paquete. El voltaje de corte debe estar en la misma escala que el voltaje convertido.</p>
          <label className="time-origin"><input type="checkbox" checked={importOptions.invertCurrent ?? false} onChange={(event) => applyImport(csvData, { ...importOptions, invertCurrent: event.target.checked })} /><span>Invertir el signo de corriente<span className="time-origin-description">Actívalo si tu equipo registra la descarga positiva y necesitas expresarla negativa. Conserva el signo relativo de la regeneración.</span></span></label>
          <label className="time-origin">
            <input type="checkbox" checked={importOptions.relativeTime}
              disabled={importOptions.timeUnit === "datetime"}
              onChange={(event) => applyImport(csvData, { ...importOptions, relativeTime: event.target.checked })} />
            <span><strong>Contar desde la primera muestra</strong>
              <span className="time-origin-description">Actívalo si el archivo comienza al inicio de la descarga.</span>
            </span>
          </label>
          <p className="csv-window-note">Se utilizan los primeros <strong>300 segundos</strong> de la descarga.
            Si tu archivo empieza a mitad de la descarga, desactiva la opción anterior para conservar el tiempo original.</p>
        </fieldset>
        {(fileWarnings.length > 0 || !!importMetadata?.warnings.length) && <div className="import-file-notes">{[...new Set([...fileWarnings, ...(!automaticSource ? importMetadata?.warnings ?? [] : [])])].map(note => <p key={note}>{note}</p>)}</div>}
        </details>
        </div>
      )}

      </fieldset>
      </div>
      {analysisStarted && batteryParameters}
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
