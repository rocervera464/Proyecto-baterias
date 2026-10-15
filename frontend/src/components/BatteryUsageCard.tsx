import { getBatteryUsage } from "../utils/batteryUsage";
import { getSohImages } from "../utils/sohImage";
import Icon from "./Icon";

export default function BatteryUsageCard({ soh }: { soh: number }) {
  const usage = getBatteryUsage(soh);
  const images = getSohImages(soh);

  return (
    <section data-reveal className="battery-usage" aria-labelledby="battery-usage-title">
      <p className="section-kicker">REUTILIZACIÓN Y CIRCULARIDAD</p>
      <h3 id="battery-usage-title">Potencial de segunda vida</h3>
      {usage ? (
        <>
          <div className="battery-usage-status">
            <strong>{usage.state}</strong>
            <span>Rango orientativo: {usage.range}</span>
          </div>
          <p>Posibles usos según la tabla del proyecto; su viabilidad no puede determinarse solo con SoH.</p>
          <div className="usage-options">
            {usage.uses.map((use, index) => <article key={use}><Icon name={index === 0 ? "solar" : index === 1 ? "shield" : "grid"} /><h4>{use}</h4><p>Requiere evaluación técnica y de seguridad adicional.</p></article>)}
          </div>
          {images.length > 0 && (
            <details className="usage-illustrations"><summary>Ver ilustraciones de los usos orientativos</summary>
            <div className={images.length > 1 ? "soh-image-gallery soh-image-gallery-pair" : "soh-image-gallery"}>
              {images.map((image) => (
                <img
                  key={image.src}
                  className={soh >= 90 ? "soh-state-image soh-state-image-excellent" : "soh-state-image"}
                  src={image.src}
                  alt={image.alt}
                  width={1376}
                  height={768}
                />
              ))}
            </div></details>
          )}
          <p className="battery-usage-note">
            Las aplicaciones sugeridas son orientativas y se basan en el estado de salud estimado. La reutilización requiere evaluaciones técnicas y de seguridad adicionales.
            El porcentaje por sí solo no confirma la aptitud para estos usos:
            se requieren pruebas de seguridad, potencia y condición de las celdas antes de reutilizar la batería.
          </p>
        </>
      ) : (
        <p>El SoH estimado está fuera del intervalo de 0–100 % de la tabla.
          Revisa la predicción antes de asignar un uso.</p>
      )}
    </section>
  );
}
