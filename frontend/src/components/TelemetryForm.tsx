import TelemetryInformationGuide from "./TelemetryInformationGuide";
import ManualTelemetryEditor from "./ManualTelemetryEditor";
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
  convertTelemetryCsv,
  TELEMETRY_FIELDS,
} from "../utils/parseTelemetryCsv";

import type { CsvData, ImportOptions } from "../utils/parseTelemetryCsv";
import Icon from "./Icon";

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
    "4",
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
  const [manualRows, setManualRows] = useState<ManualRow[]>(() => [emptyManualRow(), emptyManualRow()]);
  const manual = validateManualTelemetry(manualRows);
  const activeSamples = inputMode === "manual" ? manual.samples : samples;
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleInvalid(event: React.FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const message = input.validity.valueMissing ? "Este campo es obligatorio."
      : input.validity.rangeUnderflow ? `El valor mínimo es ${input.min}.`
      : input.validity.stepMismatch ? "Revisa los decimales admitidos para este campo."
      : "Ingresa un número válido.";
    setFieldErrors((errors) => ({ ...errors, [input.name]: message }));
  }

  function applyImport(data: CsvData, options: ImportOptions, updateParameters = false) {
    setImportOptions(options);
    setSamples([]);
    setCsvError(null);
    if (updateParameters) {
      const metadata = getImportMetadata(data, options);
      if (metadata.cycle !== undefined) setCycle(String(metadata.cycle));
      if (metadata.ambient !== undefined) setAmbientTemperature(String(metadata.ambient));
    }
    try {
      setSamples(convertTelemetryCsv(data, options));
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
    setCsvError(null);
    if (!file) return;
    setReadingFile(true);
    try {
      if (/\.(xlsx?|parquet|mat)$/i.test(file.name)) throw new Error("Este formato binario requiere exportar las mediciones como CSV, TSV o JSON. No se puede convertir solo cambiando la extensión.");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
      const data = readTelemetryCsv(new TextDecoder(encoding).decode(buffer));
      setCsvData(data);
      applyImport(data, getDefaultImportOptions(data), true);
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "No fue posible leer el archivo.");
    } finally {
      setReadingFile(false);
    }
  }

  async function handleSubmit(
    event:
      React.FormEvent,
  ) {

    event.preventDefault();
    if (loading || readingFile || submitting.current) return;
    setSubmitError(null);
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

        cycle: Number(cycle),

        ambient_temperature_c:
          Number(ambientTemperature),

        cutoff_voltage_v:
          Number(cutoffVoltage),

        discharge_samples:
          activeSamples,
      };


    if (
      reValue !== ""
      ||
      rctValue !== ""
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
      chargeTempStart !== ""
      ||
      chargeTempMax !== ""
      ||
      chargeTempDelta !== ""
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
    if (!numericValues.every((value) => value == null || Number.isFinite(value)) || !Number.isInteger(telemetry.cycle) || telemetry.cycle < 1 || telemetry.cutoff_voltage_v <= 0) {
      setSubmitError("Revisa los parámetros generales y opcionales: deben ser números finitos, con un ciclo entero positivo y un voltaje de corte mayor que cero."); return;
    }
    submitting.current = true;
    try {
      await onSubmit(telemetry, { warnings: inputMode === "manual" ? manual.warnings : csvData && importOptions ? getImportMetadata(csvData, importOptions).warnings : [] });
    } finally { submitting.current = false; }
  }


  const samplesInWindow =
    samples.filter(
      (
        sample,
      ) =>
        sample.time_s <= 300,
    ).length;


  return (
    <form
      className="telemetry-form"
      aria-busy={loading || readingFile}
      onInput={() => setFieldErrors({})}
      onSubmit={
        handleSubmit
      }
    >

      <div className="analysis-columns">
      <section data-reveal id="parametros" className="parameter-panel" aria-labelledby="parameters-title">
      <div className="parameter-heading">
        <span className="panel-icon"><Icon name="battery" /></span>
        <div><h2 id="parameters-title">Configura tu batería</h2>
        <p className="panel-description">Define el ciclo y las condiciones de la descarga.</p></div>
      </div>


      <div className="form-grid">

        <label>

          Ciclo actual de carga

          <input
            type="number"
            min="1"
            name="cycle"
            placeholder="Ej.: 25"
            aria-invalid={!!fieldErrors.cycle}
            aria-describedby="cycle-error"
            onInvalid={handleInvalid}
            value={
              cycle
            }
            onChange={
              (
                event,
              ) =>
                setCycle(
                  event
                      .target
                      .value,
                )
            }
            required
          />
          <span id="cycle-error" className="field-error">{fieldErrors.cycle}</span>

        </label>


        <label>

          Temperatura ambiente [°C]

          <input
            type="number"
            step="0.1"
            name="ambient_temperature_c"
            placeholder="Ej.: 25"
            aria-invalid={!!fieldErrors.ambient_temperature_c}
            aria-describedby="ambient-error"
            onInvalid={handleInvalid}
            value={
              ambientTemperature
            }
            onChange={
              (
                event,
              ) =>
                setAmbientTemperature(
                  event
                      .target
                      .value,
                )
            }
            required
          />
          <span id="ambient-error" className="field-error">{fieldErrors.ambient_temperature_c}</span>

        </label>


        <div className="field-with-help">
        <label>

          Voltaje de corte [V]

          <input
            type="number"
            step="0.01"
            min="0.01"
            name="cutoff_voltage_v"
            placeholder="Ej.: 2,20"
            aria-invalid={!!fieldErrors.cutoff_voltage_v}
            aria-describedby="cutoff-error cutoff-help"
            onInvalid={handleInvalid}
            value={
              cutoffVoltage
            }
            onChange={
              (
                event,
              ) =>
                setCutoffVoltage(
                  event
                      .target
                      .value,
                )
            }
            required
          />
          <span id="cutoff-error" className="field-error">{fieldErrors.cutoff_voltage_v}</span>

        </label>
        <details className="field-help-toggle">
          <summary>Ver descripción</summary>
          <p className="field-help" id="cutoff-help">Umbral de voltaje al que se detiene la descarga. Introduce el valor configurado en la prueba, en voltios; no es necesariamente el voltaje final del archivo. Debe corresponder a la misma celda o conjunto que las mediciones.</p>
        </details>
        </div>

      </div>


      <details>

        <summary>
          Parámetros avanzados
        </summary>


        <h3>
          EIS previo
        </h3>
        <details className="field-help-toggle section-help-toggle"><summary>¿Qué es el EIS previo?</summary><p className="panel-description">EIS significa espectroscopia de impedancia electroquímica: una prueba que caracteriza la respuesta eléctrica de la celda. Usa los valores de una medición anterior a esta descarga; si no los tienes, deja estos campos vacíos.</p></details>


        <div className="form-grid">

          <div className="field-with-help">
          <label>

            Re [Ω]

            <input
              aria-describedby="eis-re-help"
              type="number"
              step="any"
              placeholder="Opcional · Ω"
              value={
                reValue
              }
              onChange={
                (
                  event,
                ) =>
                  setReValue(
                    event
                      .target
                      .value,
                  )
              }
            />
          </label>
          <details className="field-help-toggle"><summary>Ver descripción</summary><p className="field-help" id="eis-re-help">Resistencia del electrolito: oposición al paso de iones dentro de la celda, medida en ohmios (Ω).</p></details>
          </div>


          <div className="field-with-help">
          <label>

            Rct [Ω]

            <input
              aria-describedby="eis-rct-help"
              type="number"
              step="any"
              placeholder="Opcional · Ω"
              value={
                rctValue
              }
              onChange={
                (
                  event,
                ) =>
                  setRctValue(
                    event
                      .target
                      .value,
                  )
              }
            />
          </label>
          <details className="field-help-toggle"><summary>Ver descripción</summary><p className="field-help" id="eis-rct-help">Resistencia de transferencia de carga: dificultad de las reacciones entre los electrodos y el electrolito, medida en ohmios (Ω).</p></details>
          </div>

        </div>


        <h3>
          Carga previa
        </h3>
        <details className="field-help-toggle section-help-toggle"><summary>¿Qué datos de la carga previa se necesitan?</summary><p className="panel-description">Datos de temperatura de la carga anterior a esta descarga. Son opcionales; déjalos vacíos si no se midieron.</p></details>


        <div className="form-grid">

          <div className="field-with-help">
          <label>

            Temperatura inicial [°C]

            <input
              aria-describedby="charge-start-help"
              type="number"
              step="0.1"
              placeholder="Opcional · °C"
              value={
                chargeTempStart
              }
              onChange={
                (
                  event,
                ) =>
                  setChargeTempStart(
                    event
                      .target
                      .value,
                  )
              }
            />
          </label>
          <details className="field-help-toggle"><summary>Ver descripción</summary><p className="field-help" id="charge-start-help">Temperatura de la batería al comenzar la carga anterior.</p></details>
          </div>


          <div className="field-with-help">
          <label>

            Temperatura máxima [°C]

            <input
              aria-describedby="charge-max-help"
              type="number"
              step="0.1"
              placeholder="Opcional · °C"
              value={
                chargeTempMax
              }
              onChange={
                (
                  event,
                ) =>
                  setChargeTempMax(
                    event
                      .target
                      .value,
                  )
              }
            />
          </label>
          <details className="field-help-toggle"><summary>Ver descripción</summary><p className="field-help" id="charge-max-help">Mayor temperatura registrada en la batería durante la carga anterior.</p></details>
          </div>


          <div className="field-with-help">
          <label>

            Cambio de temperatura [°C]

            <input
              aria-describedby="charge-delta-help"
              type="number"
              step="0.1"
              placeholder="Opcional · °C"
              value={
                chargeTempDelta
              }
              onChange={
                (
                  event,
                ) =>
                  setChargeTempDelta(
                    event
                      .target
                      .value,
                  )
              }
            />
          </label>
          <details className="field-help-toggle"><summary>Ver descripción</summary><p className="field-help" id="charge-delta-help">Cambio de temperatura durante la carga anterior: temperatura final menos temperatura inicial. Ejemplo: al terminar a 32 °C y comenzar a 25 °C, el cambio es 7 °C.</p></details>
          </div>

        </div>

      </details>
      </section>
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
        <span className="csv-format-badge">{inputMode === "csv" ? "CSV / JSON" : "INGRESO MANUAL"}</span>
      </div>


      <div className="telemetry-source-selector" role="group" aria-label="Método de ingreso de telemetría">
        <button type="button" aria-pressed={inputMode === "csv"} disabled={loading || readingFile} onClick={() => { setInputMode("csv"); setSubmitError(null); }}>Cargar archivo CSV</button>
        <button type="button" aria-pressed={inputMode === "manual"} disabled={loading || readingFile} onClick={() => { setInputMode("manual"); setSubmitError(null); }}>Ingresar datos manualmente</button>
      </div>
      {inputMode === "manual" && <TelemetryInformationGuide />}
      <div hidden={inputMode !== "manual"}><ManualTelemetryEditor rows={manualRows} onChange={setManualRows} disabled={loading || readingFile || inputMode !== "manual"} /></div>
      <div hidden={inputMode !== "csv"}>
      <fieldset className="csv-source-fields" disabled={inputMode !== "csv"}>
      <label className={`file-upload${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!loading && !readingFile) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]); }}>

        <span className="csv-upload-title">Arrastra tu telemetría o selecciona un archivo</span>
        <span className="csv-upload-description">CSV, TSV, TXT o JSON. Puedes elegir la batería, el ciclo y el tramo de descarga.</span>

        <input
          type="file"
          accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,text/plain,application/json"
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
        {(getImportMetadata(csvData, importOptions).cycle !== undefined || getImportMetadata(csvData, importOptions).ambient !== undefined) && <p className="csv-help">Datos detectados en el archivo: {getImportMetadata(csvData, importOptions).cycle !== undefined ? `ciclo ${getImportMetadata(csvData, importOptions).cycle}` : "ciclo no especificado"} · {getImportMetadata(csvData, importOptions).ambient !== undefined ? `ambiente ${getImportMetadata(csvData, importOptions).ambient} °C` : "temperatura ambiente no especificada"}. Se completan al cargar o cambiar de tramo; puedes ajustar los parámetros arriba.</p>}
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
                <option value="min">Minutos</option><option value="h">Horas</option>
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
          <p className="csv-window-note">El valor 1 conserva las mediciones originales. Usa otros divisores solo si conoces la configuración y el reparto de corriente del paquete. La conversión a valores equivalentes por celda no reproduce una prueba de descarga NASA ni valida el modelo para otra química. El voltaje de corte del formulario debe estar en la misma escala que el voltaje convertido.</p>
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
      </section>




      </div>
      {inputMode === "csv" && samples.length > 0 && <section data-reveal className="csv-preview" aria-labelledby="preview-title">
        <div className="preview-heading"><h3 id="preview-title">Vista previa de telemetría</h3><span>Primeras {Math.min(5, samples.length)} muestras · unidades normalizadas</span></div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Vista previa del CSV. Desplázate para ver todas las columnas.">
          <table><thead><tr>{TELEMETRY_FIELDS.map((field) => <th key={field} scope="col">{field}</th>)}</tr></thead>
          <tbody>{samples.slice(0, 5).map((sample, index) => <tr key={index}>{TELEMETRY_FIELDS.map((field) => <td key={field}>{Number(sample[field].toFixed(4))}</td>)}</tr>)}</tbody></table>
        </div>
      </section>}
      <div data-reveal className="analysis-submit">
      {submitError && <p className="form-error" role="alert">{submitError}</p>}
      <button
        type="submit"
        disabled={
          loading
          || readingFile
          ||
          activeSamples.length < 2
        }
      >

        {
          loading
            ? "Analizando la batería…"
            : "Analizar batería"
        }

      </button>
      <p role="status">{loading ? "Análisis en curso. Los modelos están procesando la telemetría." : "Completa los parámetros y valida el CSV para iniciar el análisis."}</p>
      </div>

    </form>
  );
}
