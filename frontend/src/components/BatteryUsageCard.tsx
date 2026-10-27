import { getSohClassification } from "../data/batterySecondLifeData";
import BatteryUseCarousel from "./BatteryUseCarousel";
import { getSohImages } from "../utils/sohImage";
import Icon from "./Icon";


export default function BatteryUsageCard({ soh, exploratory = false }: { soh: number; exploratory?: boolean }) {
  const usage = getSohClassification(soh);
  const images = getSohImages(soh);

  return (
    <section data-reveal id="usos-bateria" className="battery-usage" aria-labelledby="battery-usage-title">
      <p className="section-kicker">REUTILIZACIÓN Y CIRCULARIDAD</p>
      <div className="second-life-title"><span className="panel-icon"><Icon name="battery" /></span><h3 id="battery-usage-title">Posibles usos de la batería según su estado de salud</h3></div>
      <p>Explora aplicaciones potenciales para esta batería según su estado de salud estimado. Las recomendaciones son orientativas y requieren evaluación técnica antes de su implementación.</p>
      {exploratory && <div className="import-warnings" role="note"><strong>Posibles usos orientativos · predicción exploratoria</strong><p>Estas aplicaciones se muestran según el SoH estimado, que puede depender de datos reconstruidos, supuestos o condiciones sin validar. Su viabilidad requiere una evaluación técnica de la batería.</p></div>}
      {usage ? (
        <>
          <div className="battery-usage-status">
            <span className="second-life-soh">SoH actual: <strong>{soh.toFixed(2)} %</strong></span>
            <strong className="badge">{usage.label}</strong>
            <span>Rango orientativo: {usage.range}</span>
          </div>
          <div className={`second-life-intro${images.length ? " has-image" : ""}`}>
            <div className="second-life-intro-copy">
              <p className="second-life-interpretation">{usage.interpretation}</p>
              <p className="second-life-rationale">{usage.rationale}</p>
            </div>
            {images.length > 0 && <figure className="second-life-intro-images">
              {images.map((image) => <img key={image.src} src={image.src} alt={image.alt} loading="lazy" decoding="async" />)}
              <figcaption className="sr-only">Imagen representativa del rango {usage.range}; no acredita la viabilidad de una aplicación real.</figcaption>
            </figure>}
          </div>
          <BatteryUseCarousel key={`${usage.id}-${soh}`} applications={usage.applications} />
        </>
      ) : (
        <p>El SoH actual no es un valor numérico válido entre 0 y 100 %.
          Revisa la predicción antes de asignar un uso.</p>
      )}
      <p className="battery-usage-note">Los posibles usos presentados son orientativos y se basan principalmente en el SoH estimado. Este resultado no constituye una certificación de seguridad ni garantiza la viabilidad de reutilización. Es necesario realizar pruebas especializadas de capacidad, potencia, integridad, resistencia interna, comportamiento térmico y compatibilidad antes de cualquier aplicación real.</p>
    </section>
  );
}
