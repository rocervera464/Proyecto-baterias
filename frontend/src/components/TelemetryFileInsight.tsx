import Icon from "./Icon";
import type { TelemetrySample } from "../types/telemetry";

export default function TelemetryFileInsight({ samples, reading, complete }: {
  samples: TelemetrySample[]; reading: boolean; complete: boolean;
}) {
  const window = samples.filter(sample => sample.time_s <= 300);
  const ready = window.length >= 2;
  const low = ready ? window.reduce((value, sample) => Math.min(value, sample.voltage_v), Infinity) : 0;
  const high = ready ? window.reduce((value, sample) => Math.max(value, sample.voltage_v), -Infinity) : 0;
  const start = window[0]?.time_s ?? 0;
  const end = window.at(-1)?.time_s ?? 0;
  const plot = window.filter((_, index) => index % Math.max(1, Math.ceil(window.length / 90)) === 0 || index === window.length - 1);
  const points = plot.map(sample => `${12 + (sample.time_s - start) / Math.max(end - start, 1) * 296},${66 - (sample.voltage_v - low) / Math.max(high - low, .001) * 48}`).join(" ");
  const format = (value: number, digits = 2) => value.toLocaleString("es", { maximumFractionDigits: digits });
  return <aside className={`telemetry-insight${ready ? " is-ready" : ""}`} aria-label="Resumen de la telemetría">
    <div className="telemetry-insight-heading"><span className="telemetry-insight-icon"><Icon name={ready ? "check" : "layers"} /></span><div>
      <p className="telemetry-eyebrow">{ready ? "LECTURA DEL ARCHIVO" : "ANTES DE EMPEZAR"}</p>
      <h4>{reading ? "Leyendo tus mediciones…" : complete ? "Análisis completado" : ready ? "Tus señales están listas" : "Cuatro señales, un análisis"}</h4>
    </div></div>
    {ready ? <>
      <dl className="telemetry-file-stats"><div><dt>Muestras de análisis</dt><dd>{window.length.toLocaleString("es")}</dd></div><div><dt>Ventana disponible</dt><dd>{format(end - start, 1)} <small>s</small></dd></div></dl>
      <figure className="telemetry-signal-preview"><figcaption><span>Voltaje medido</span><strong>{format(window[0].voltage_v)} → {format(window.at(-1)!.voltage_v)} V</strong></figcaption>
        <svg viewBox="0 0 320 80" preserveAspectRatio="none" role="img" aria-label={`Voltaje medido entre ${format(start, 1)} y ${format(end, 1)} segundos`}>
          <path d="M12 26H308M12 50H308M12 74H308" stroke="currentColor" strokeOpacity=".12" strokeDasharray="3 5" />
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg><div className="telemetry-signal-axis"><span>{format(start, 1)} s</span><span>{format(end, 1)} s</span></div>
      </figure>
      <div className="telemetry-detected-signals" aria-label="Variables detectadas">{["Tiempo", "Voltaje", "Corriente", "Temperatura"].map(name => <span key={name}><Icon name="check" />{name}</span>)}</div>
      <p className="telemetry-insight-note">{complete ? "Consulta la estimación y sus detalles en los resultados." : "Al analizar, comprobaremos las señales y seleccionaremos el modelo compatible."}</p>
      {complete && <a className="telemetry-results-link" href="#resultados">Ver resultados <Icon name="arrow" /></a>}
    </> : <>
      <p className="telemetry-insight-intro">Usa mediciones de una misma batería y descarga.</p>
      <ul className="telemetry-required-signals">{[["Tiempo", "s"], ["Voltaje", "V"], ["Corriente", "A"], ["Temperatura", "°C"]].map(([label, unit]) => <li key={label}><span><Icon name="check" />{label}</span><span>{unit}</span></li>)}</ul>
      <p className="telemetry-insight-note">El análisis utiliza las muestras disponibles de los primeros 300 segundos.</p>
    </>}
  </aside>;
}
