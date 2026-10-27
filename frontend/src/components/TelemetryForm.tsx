import { detectBatteryParameters } from "../utils/batteryParameters";
import Icon from "./Icon";
import { importTelemetryFile } from "../services/api";
import TelemetryInformationGuide from "./TelemetryInformationGuide";
import ManualTelemetryWizard from "./ManualTelemetryWizard";
import { emptyManualRow, validateManualTelemetry } from "../utils/manualTelemetry";
import type { ManualRow } from "../utils/manualTelemetry";
import {
  useState,
  useRef,
} from "react";

import {
  readTelemetryCsv,
  getDefaultImportOptions,
  getTelemetrySegments,
  getImportMetadata,
  recoverTelemetry,
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
  ) => Promise<void>;

  loading: boolean;
}


export default function TelemetryForm({
  onSubmit,
  loading,
}: TelemetryFormProps) {

  const [
    cycle,
    setCycle,
  ] = useState(
    "1",
  );

  const [
    ambientTemperature,
    setAmbientTemperature,
  ] = useState(
    "25",
  );

  const [
    cutoffVoltage,
    setCutoffVoltage,
  ] = useState(
    "2.2",
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
  const exploratory = true;
  const [detectedParameters, setDetectedParameters] = useState<Record<string, string>>({});
  const [editedParameters, setEditedParameters] = useState<string[]>([]);
  const [recoveryWarnings, setRecoveryWarnings] = useState<string[]>([]);
  const [binaryFile, setBinaryFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [historyFromFile, setHistoryFromFile] = useState(false);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  function applyImport(data: CsvData, options: ImportOptions, updateParameters = false) {
    setImportOptions(options);
    setSamples([]);
    setCsvError(null);
    setRecoveryWarnings([]);
    if (updateParameters) {
      const detected = detectBatteryParameters(data, options);
      setDetectedParameters(detected); setEditedParameters([]);
      setCycle(detected.cycle ?? "1"); setAmbientTemperature(detected.ambient ?? "25"); setCutoffVoltage(detected.cutoff ?? "2.2");
      setMeasurementLevel((detected.level ?? "unknown") as typeof measurementLevel);
      setChemistry((detected.chemistry ?? "unknown") as typeof chemistry);
      setHistoryFromFile(true);
      setReValue(detected.re ?? ""); setRctValue(detected.rct ?? "");
      setChargeTempStart(detected.chargeStart ?? ""); setChargeTempMax(detected.chargeMax ?? ""); setChargeTempDelta(detected.chargeDelta ?? "");
    }
    try {
      const recovered = recoverTelemetry(data, options);
      setSamples(recovered.samples);
      setRecoveryWarnings(recovered.warnings);
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "No fue posible procesar el archivo.");
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    await loadFile(event.target.files?.[0]);
  }

  async function loadFile(file: File | undefined) {
    if (loading || readingFile) return;
    setSamples([]);
    setCsvData(null);
    setImportOptions(null);
    setFileName(file?.name ?? "");
    setRecoveryWarnings([]);
    setCsvError(null);
    setSheets([]); setSelectedSheet(""); setFileWarnings([]); setBinaryFile(null);
    if (!file) return;
    setMeasurementLevel("unknown"); setChemistry("unknown");
    if (historyFromFile) {
      setReValue(""); setRctValue(""); setChargeTempStart(""); setChargeTempMax(""); setChargeTempDelta(""); setHistoryFromFile(false);
    }
    setReadingFile(true);
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error("El archivo supera 40 MB. Selecciona un tramo menor.");
      if (/\.(xlsx?|parquet|mat)$/i.test(file.name)) {
        setBinaryFile(file);
        const imported = await importTelemetryFile(file);
        setSheets(imported.sheets); setSelectedSheet(imported.selected_sheet ?? ""); setFileWarnings(imported.warnings);
        if (imported.rows.length) { setCsvData(imported); applyImport(imported, getDefaultImportOptions(imported), true); }
        return;
      }
      if (!/\.(csv|tsv|txt|json)$/i.test(file.name)) throw new Error("Formato no soportado. Usa CSV, TSV, TXT, JSON, XLSX, XLS, MAT o Parquet.");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
      const data = readTelemetryCsv(new TextDecoder(encoding).decode(buffer));
      if (data.rows.length > 100_000) throw new Error("El archivo supera 100 000 filas. Selecciona un tramo menor.");
      setCsvData(data);
      applyImport(data, getDefaultImportOptions(data), true);
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "No fue posible leer el archivo.");
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
      applyImport(imported, getDefaultImportOptions(imported), true);
    } catch (error) { setCsvError(error instanceof Error ? error.message : "No se pudo leer la hoja."); }
    finally { setReadingFile(false); }
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


    const telemetry:
      TelemetryRequest = {

        measurement_level: measurementLevel,
        chemistry: chemistry,
        analysis_mode: exploratory ? "exploratory" : "strict",
        cycle: Number(cycle),

        ambient_temperature_c:
          Number(ambientTemperature),

        cutoff_voltage_v:
          Number(cutoffVoltage),

        discharge_samples:
          activeSamples,
      };


    if (
      inputMode === "csv" && (reValue !== ""
      ||
      rctValue !== "")
    ) {

      telemetry.previous_eis = {

        re_ohm:
          reValue === ""
            ? null
            : Number(
                reValue,
              ),

        rct_ohm:
          rctValue === ""
            ? null
            : Number(
                rctValue,
              ),
      };
    }


    if (
      inputMode === "csv" && (chargeTempStart !== ""
      ||
      chargeTempMax !== ""
      ||
      chargeTempDelta !== "")
    ) {

      telemetry.previous_charge = {

        temperature_start_c:
          chargeTempStart === ""
            ? null
            : Number(
                chargeTempStart,
              ),

        temperature_max_c:
          chargeTempMax === ""
            ? null
            : Number(
                chargeTempMax,
              ),

        temperature_delta_c:
          chargeTempDelta === ""
            ? null
            : Number(
                chargeTempDelta,
              ),
      };
    }


    const numericValues = [telemetry.cycle, telemetry.ambient_temperature_c, telemetry.cutoff_voltage_v,
      ...Object.values(telemetry.previous_eis ?? {}), ...Object.values(telemetry.previous_charge ?? {})];
    if ([cycle, ambientTemperature, cutoffVoltage].some(value => !value.trim()) || !numericValues.every((value) => value == null || Number.isFinite(value)) || !Number.isInteger(telemetry.cycle) || telemetry.cycle < 1 || telemetry.cutoff_voltage_v <= 0) {
      setSubmitError("Revisa los parámetros generales y opcionales: deben ser números finitos, con un ciclo entero positivo y un voltaje de corte mayor que cero."); return;
    }
    submitting.current = true;
    try {
      await onSubmit(telemetry, { warnings: [
        ...(inputMode === "manual" ? manual.warnings : [...fileWarnings, ...recoveryWarnings, ...(csvData && importOptions ? getImportMetadata(csvData, importOptions).warnings : [])]),
        ...parameterWarnings,
      ] });
    } finally { submitting.current = false; }
  }


  function markEdited(key: string) { setEditedParameters(values => values.includes(key) ? values : [...values, key]); }
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
  function parameterSource(key: string) {
    if (editedParameters.includes(key)) {
      if (hasValidParameter(key)) return null;
      return ["cycle", "ambient", "cutoff"].includes(key) ? "Completa este campo con un valor válido" : "No declarado: opcional";
    }
    if (detectedParameters[key] !== undefined) return "Detectado en el archivo";
    return ["cycle", "ambient", "cutoff"].includes(key) ? "Valor supuesto: puedes cambiarlo" : "No declarado: opcional";
  }
  const parameterWarnings = [
    ...(!hasValidParameter("cycle") ? ["Completa el ciclo con un número entero mayor que cero."] : !editedParameters.includes("cycle") && detectedParameters.cycle === undefined ? [`Ciclo no declarado: se usa ${cycle} como supuesto.`] : []),
    ...(!hasValidParameter("ambient") ? ["Completa la temperatura ambiente con un valor válido."] : !editedParameters.includes("ambient") && detectedParameters.ambient === undefined ? [`Temperatura ambiente no declarada: se usa ${ambientTemperature} °C como supuesto.`] : []),
    ...(!hasValidParameter("cutoff") ? ["Completa el voltaje de corte con un valor mayor que cero."] : !editedParameters.includes("cutoff") && detectedParameters.cutoff === undefined ? [`Voltaje de corte no declarado: se usa ${cutoffVoltage} V como supuesto.`] : []),
  ];

  const samplesInWindow =
    samples.filter(
      (
        sample,
      ) =>
        sample.time_s <= 300,
    ).length;


  const parametersValid = ["cycle", "ambient", "cutoff"].every(hasValidParameter);
  const batteryParameters = (
      <fieldset className="battery-context" id="parametros" disabled={loading || readingFile}>
        <legend>Datos de la batería</legend>
        <p>{inputMode === "manual" ? "Completa los parámetros de esta descarga y revisa los valores supuestos." : "Se reconocen los valores declarados al cargar el archivo o cambiar de tramo. Puedes corregirlos antes de analizar."} El voltaje se expresa en V y la temperatura en °C.</p>
        <div className="form-grid">
          <label>Ciclo de descarga<input type="number" step="1" required value={cycle} onChange={event => { setCycle(event.target.value); markEdited("cycle"); }} /><small>{parameterSource("cycle")}</small></label>
          <label>Temperatura ambiente (°C)<input type="number" step="any" required value={ambientTemperature} onChange={event => { setAmbientTemperature(event.target.value); markEdited("ambient"); }} /><small>{parameterSource("ambient")}</small></label>
          <label>Voltaje de corte (V)<input type="number" step="any" required value={cutoffVoltage} onChange={event => { setCutoffVoltage(event.target.value); markEdited("cutoff"); }} /><small>{parameterSource("cutoff")}</small></label>
          <label>Nivel de medición<select value={measurementLevel} onChange={event => { setMeasurementLevel(event.target.value as typeof measurementLevel); markEdited("level"); }}><option value="unknown">Desconocido</option><option value="cell">Celda</option><option value="module">Módulo</option><option value="pack">Paquete</option></select><small>{parameterSource("level")}</small></label>
          <label>Química<select value={chemistry} onChange={event => { setChemistry(event.target.value as typeof chemistry); markEdited("chemistry"); }}><option value="unknown">Desconocida</option><option value="li-ion">Ion litio</option><option value="LFP">LFP</option><option value="lead-acid">Plomo ácido</option><option value="other">Otra</option></select><small>{parameterSource("chemistry")}</small></label>
        </div>
        {(parameterWarnings.length > 0 || (inputMode === "csv" && recoveryWarnings.length > 0)) && <p className="csv-help">El análisis es exploratorio. Las señales ausentes pueden reconstruirse o simularse con supuestos visibles; el resultado no certifica la salud real de la batería.</p>}
        {parameterWarnings.length > 0 && <div className="import-warnings" role="note">{parameterWarnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
        {inputMode === "csv" && recoveryWarnings.length > 0 && <div className="import-warnings" role="note">{recoveryWarnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
      </fieldset>
  );

  return (
    <form
      className="telemetry-form"
      aria-busy={loading || readingFile}
      onSubmit={
        handleSubmit
      }
    >

      <div className="analysis-columns">
<section data-reveal id="telemetria" className="telemetry-import" aria-labelledby="telemetry-import-title">
      <div className="telemetry-import-heading">
        <span className="telemetry-import-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          </svg>
        </span>
        <div>
          <h3 id="telemetry-import-title">Carga la telemetría</h3>
          <p>Elige cómo ingresar tus mediciones y prepara los datos de la predicción.</p>
        </div>
        <span className="csv-format-badge">{inputMode === "csv" ? "ARCHIVO" : "INGRESO MANUAL"}</span>
      </div>


      <div className="telemetry-source-selector" role="group" aria-label="Método de ingreso de telemetría">
        <button type="button" aria-pressed={inputMode === "csv"} disabled={loading || readingFile} onClick={() => { setInputMode("csv"); setSubmitError(null); }}>
          <span className="source-option-icon"><Icon name="upload" /></span>
          <span className="source-option-copy"><strong>Cargar archivo</strong><span>Importa tu telemetría</span></span>
          <span className="source-option-check" aria-hidden="true"><Icon name="check" /></span>
        </button>
        <button type="button" aria-pressed={inputMode === "manual"} disabled={loading || readingFile} onClick={() => { setInputMode("manual"); setSubmitError(null); }}>
          <span className="source-option-icon"><Icon name="edit" /></span>
          <span className="source-option-copy"><strong>Ingresar datos manualmente</strong><span>Sigue una guía paso a paso</span></span>
          <span className="source-option-check" aria-hidden="true"><Icon name="check" /></span>
        </button>
      </div>
      {inputMode === "manual" && <TelemetryInformationGuide />}
      {inputMode === "manual" && <ManualTelemetryWizard rows={manualRows} onChange={setManualRows} disabled={loading || readingFile} step={manualStep} onStepChange={setManualStep} parameters={batteryParameters} parametersValid={parametersValid} parameterWarnings={parameterWarnings} parameterSummary={[
        { label: "Ciclo", value: cycle },
        { label: "Temperatura ambiente", value: `${ambientTemperature} \u00b0C` },
        { label: "Voltaje de corte", value: `${cutoffVoltage} V` },
        { label: "Nivel", value: ({ unknown: "Desconocido", cell: "Celda", module: "M\u00f3dulo", pack: "Paquete" })[measurementLevel] },
        { label: "Qu\u00edmica", value: ({ unknown: "Desconocida", "li-ion": "Ion litio", LFP: "LFP", "lead-acid": "Plomo \u00e1cido", other: "Otra" })[chemistry] },

      ]} />}
      <div hidden={inputMode !== "csv"}>
      <fieldset className="csv-source-fields" disabled={inputMode !== "csv"}>
      {sheets.length > 1 && <div className="form-grid binary-sheet-select"><label>Hoja o batería del archivo<select value={selectedSheet} disabled={readingFile || loading} onChange={(event) => void changeSheet(event.target.value)}><option value="" disabled>Selecciona una tabla</option>{sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}</select></label></div>}
      {!!fileWarnings.length && <div className="import-warnings">{fileWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      <label className={`file-upload${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!loading && !readingFile) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]); }}>

        <span className="csv-upload-title">Arrastra tu telemetría o selecciona un archivo</span>
        <span className="csv-upload-description">CSV, Excel (XLSX/XLS), Parquet, MAT, TSV, TXT o JSON. Puedes elegir la batería, el ciclo y el tramo de descarga.</span>

        <input
          type="file"
          accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.mat,.parquet"
          aria-describedby="csv-import-help csv-status"
          aria-invalid={!!csvError}
          disabled={readingFile || loading}
          onChange={
            handleFileChange
          }
        />

      </label>


      <p id="csv-status" className="csv-status" role="status">{readingFile ? "Adaptando y validando telemetría…" : csvError ? "La importación necesita ajustes. Revisa el mensaje y las columnas." : samples.length ? "Telemetría adaptada · lista para analizar" : "Sin archivo seleccionado"}</p>
      <p className="csv-help" id="csv-import-help">
        Reconoce nombres comunes, unidades y fechas. Puedes asignar columnas personalizadas;
        solo se usan tiempo, voltaje, corriente y temperatura para la telemetría del modelo.
      </p>

      {csvData && importOptions && (
        <div className="csv-configuration">
        {(getImportMetadata(csvData, importOptions).cycle !== undefined || getImportMetadata(csvData, importOptions).ambient !== undefined) && <p className="csv-help">Datos detectados en el archivo: {getImportMetadata(csvData, importOptions).cycle !== undefined ? `ciclo ${getImportMetadata(csvData, importOptions).cycle}` : "ciclo no especificado"} · {getImportMetadata(csvData, importOptions).ambient !== undefined ? `ambiente ${getImportMetadata(csvData, importOptions).ambient} °C` : "temperatura ambiente no especificada"}. Se aplican automáticamente al cargar o cambiar de tramo.</p>}
        {getTelemetrySegments(csvData).length > 1 && <div className="form-grid segment-selector"><label>
          Batería, ciclo y tramo que se analizarán
          <select value={importOptions.segmentId ?? ""} disabled={loading || readingFile} onChange={(event) => applyImport(csvData, { ...importOptions, segmentId: event.target.value }, true)}>
            {getTelemetrySegments(csvData).map((segment) => <option key={segment.id} value={segment.id}>{segment.label} · {segment.rows.length} muestras</option>)}
          </select>
        </label><p>Se analiza un tramo a la vez. Los periodos de carga y reposo se mantienen separados de la descarga.</p></div>}
        {getImportMetadata(csvData, importOptions).warnings.length > 0 && <div className="import-warnings" role="note">{getImportMetadata(csvData, importOptions).warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        <div className="column-chips" aria-label="Columnas asignadas">
          {TELEMETRY_FIELDS.map((field) => <span key={field} className={importOptions.mapping[field] ? "" : "column-missing"}>{field}<strong>{importOptions.mapping[field] || "Sin asignar"}</strong></span>)}
        </div>
        <details className="csv-settings" key={fileName} open={samples.length === 0}>
          <summary>Revisar columnas y unidades <span>{importOptions.timeUnit} · {importOptions.voltageUnit} · {importOptions.currentUnit} · {importOptions.temperatureUnit === "K" ? "K" : `°${importOptions.temperatureUnit}`} · {importOptions.relativeTime || importOptions.timeUnit === "datetime" ? "Desde la primera muestra" : "Tiempo original"}</span></summary>
        <fieldset className="csv-mapping" disabled={loading || readingFile}>
          <legend>Columnas y unidades del CSV</legend>
          <p className="csv-mapping-intro">Revisa las columnas detectadas y confirma las unidades de tus mediciones.</p>
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
          <p className="csv-window-note">El valor 1 conserva las mediciones originales. Usa otros divisores solo si conoces la configuración y el reparto de corriente del paquete. La conversión a valores equivalentes por celda no reproduce una prueba de descarga NASA ni valida el modelo para otra química. El voltaje de corte se toma del archivo cuando está disponible; de lo contrario se utiliza 2,2 V. Debe estar en la misma escala que el voltaje convertido.</p>
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
        </details>
        </div>
      )}

      {
        fileName
        && samples.length > 0
        &&
        (
          <div className="file-summary">

            <strong>
              {fileName}
            </strong>

            <span>
              {
                samples.length
              }
              {" "}
              muestras del tramo seleccionado
            </span>

            <span>
              {
                samplesInWindow
              }
              {" "}
              muestras utilizadas
              en 0–300 s
            </span>

          </div>
        )
      }


      {
        csvError
        &&
        (
          <p className="form-error" role="alert">
            {csvError}
          </p>
        )
      }


      </fieldset>
      </div>
      {inputMode === "csv" && batteryParameters}
      </section>




      </div>
      {inputMode === "csv" && samples.length > 0 && <section data-reveal className="csv-preview" aria-labelledby="preview-title">
        <div className="preview-heading"><h3 id="preview-title">Vista previa de telemetría</h3><span>Primeras {Math.min(5, samples.length)} muestras · unidades normalizadas</span></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Vista previa del CSV. Desplázate para ver todas las columnas.">
          <table><thead><tr>{TELEMETRY_FIELDS.map((field) => <th key={field} scope="col">{field}</th>)}</tr></thead>
          <tbody>{samples.slice(0, 5).map((sample, index) => <tr key={index}>{TELEMETRY_FIELDS.map((field) => <td key={field}>{Number(sample[field].toFixed(4))}</td>)}</tr>)}</tbody></table>
        </div>
      </section>}
      {(inputMode === "csv" || manualStep === 5) && <div className="analysis-submit">
      {submitError && <p className="form-error" role="alert">{submitError}</p>}
      <button
        type="submit"
        aria-busy={loading}
        disabled={
          loading
          || readingFile
          ||
          activeSamples.length < 2
          || (inputMode === "manual" && !parametersValid)
        }
      >

        <span className="analysis-submit-icon" aria-hidden="true">{loading ? <span className="analysis-submit-spinner" /> : <Icon name="battery" />}</span>
        <span className="analysis-submit-copy"><strong>{loading ? "Analizando la batería…" : "Analizar batería"}</strong><span>{loading ? "Preparando el resultado" : "Salud y proyecciones"}</span></span>
        <span className="analysis-submit-arrow" aria-hidden="true"><Icon name="arrow" /></span>

      </button>
      <p role="status">{loading ? "Análisis en curso. Los modelos están procesando la telemetría." : "Carga y valida la telemetría para iniciar el análisis."}</p>
      </div>}

    </form>
  );
}
