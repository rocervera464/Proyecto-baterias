import { getBatteryUsage } from "../utils/batteryUsage";
import { getSohImages } from "../utils/sohImage";

export default function BatteryUsageCard({ soh }: { soh: number }) {
  const usage = getBatteryUsage(soh);
  const images = getSohImages(soh);

  return (
    <section className="battery-usage" aria-labelledby="battery-usage-title">
      <h3 id="battery-usage-title">Usos posibles de la batería</h3>
      {usage ? (
        <>
          <div className="battery-usage-status">
            <strong>{usage.state}</strong>
            <span>Rango orientativo: {usage.range}</span>
          </div>
          {images.length > 0 && (
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
            </div>
          )}
          <ul>
            {usage.uses.map((use) => <li key={use}>{use}</li>)}
          </ul>
          <p className="battery-usage-note">
            Orientación según el SoH actual estimado y la tabla del proyecto.
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
