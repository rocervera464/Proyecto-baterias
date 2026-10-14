import {
  useState,
} from "react";

import {
  readTelemetryCsv,
  detectImportOptions,
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
    1,
  );

  const [
    ambientTemperature,
    setAmbientTemperature,
  ] = useState(
    4,
  );

  const [
    cutoffVoltage,
    setCutoffVoltage,
  ] = useState(
    2.2,
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


  const [csvData, setCsvData] = useState<CsvData | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions | null>(null);
  const [readingFile, setReadingFile] = useState(false);

  function applyImport(data: CsvData, options: ImportOptions) {
    setImportOptions(options);
    setSamples([]);
    setCsvError(null);
    try {
      setSamples(convertTelemetryCsv(data, options));
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "No fue posible procesar el archivo.");
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSamples([]);
    setCsvData(null);
    setImportOptions(null);
    setFileName(file?.name ?? "");
    setCsvError(null);
    if (!file) return;
    setReadingFile(true);
    try {
      const data = readTelemetryCsv(await file.text());
      setCsvData(data);
      applyImport(data, detectImportOptions(data.fields));
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


    if (
      samples.length < 2
    ) {

      setCsvError(
        "Debes cargar un archivo CSV válido.",
      );

      return;
    }


    const telemetry:
      TelemetryRequest = {

        cycle,

        ambient_temperature_c:
          ambientTemperature,

        cutoff_voltage_v:
          cutoffVoltage,

        discharge_samples:
          samples,
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


    await onSubmit(
      telemetry,
    );
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
      onSubmit={
        handleSubmit
      }
    >

      <h2>
        Datos de la batería
      </h2>


      <div className="form-grid">

        <label>

          Ciclo actual

          <input
            type="number"
            min="1"
            value={
              cycle
            }
            onChange={
              (
                event,
              ) =>
                setCycle(
                  Number(
                    event
                      .target
                      .value,
                  ),
                )
            }
            required
          />

        </label>


        <label>

          Temperatura ambiente [°C]

          <input
            type="number"
            step="0.1"
            value={
              ambientTemperature
            }
            onChange={
              (
                event,
              ) =>
                setAmbientTemperature(
                  Number(
                    event
                      .target
                      .value,
                  ),
                )
            }
            required
          />

        </label>


        <label>

          Voltaje de corte [V]

          <input
            type="number"
            step="0.01"
            min="0.01"
            value={
              cutoffVoltage
            }
            onChange={
              (
                event,
              ) =>
                setCutoffVoltage(
                  Number(
                    event
                      .target
                      .value,
                  ),
                )
            }
            required
          />

        </label>

      </div>


      <section className="telemetry-import" aria-labelledby="telemetry-import-title">
      <div className="telemetry-import-heading">
        <span className="telemetry-import-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          </svg>
        </span>
        <div>
          <h3 id="telemetry-import-title">Telemetría de descarga</h3>
          <p>Importa tus mediciones y prepara los datos de la predicción.</p>
        </div>
        <span className="csv-format-badge">CSV</span>
      </div>


      <label className="file-upload">

        <span className="csv-upload-title">Selecciona tu archivo de telemetría</span>
        <span className="csv-upload-description">Una batería y un ciclo de descarga por archivo.</span>

        <input
          type="file"
          accept=".csv,text/csv"
          aria-describedby="csv-import-help"
          disabled={readingFile || loading}
          onChange={
            handleFileChange
          }
        />

      </label>


      <p className="csv-help" id="csv-import-help">
        Admite coma, punto y coma o tabulación. Puedes usar otros nombres de columnas;
        las columnas adicionales se ignoran.
      </p>

      {csvData && importOptions && (
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
              muestras totales
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
          <p className="form-error">
            {csvError}
          </p>
        )
      }


      </section>

      <details>

        <summary>
          Datos opcionales
        </summary>


        <h3>
          EIS previo
        </h3>


        <div className="form-grid">

          <label>

            Re [Ω]

            <input
              type="number"
              step="any"
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


          <label>

            Rct [Ω]

            <input
              type="number"
              step="any"
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

        </div>


        <h3>
          Carga previa
        </h3>


        <div className="form-grid">

          <label>

            Temperatura inicial [°C]

            <input
              type="number"
              step="0.1"
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


          <label>

            Temperatura máxima [°C]

            <input
              type="number"
              step="0.1"
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


          <label>

            Delta temperatura [°C]

            <input
              type="number"
              step="0.1"
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

        </div>

      </details>


      <button
        type="submit"
        disabled={
          loading
          || readingFile
          ||
          samples.length < 2
        }
      >

        {
          loading
            ? "Analizando batería..."
            : "Analizar batería"
        }

      </button>

    </form>
  );
}
