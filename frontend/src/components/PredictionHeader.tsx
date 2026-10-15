import Icon from "./Icon";

export default function PredictionHeader() {
  return (
    <>
      <a className="skip-link" href="#analizador">Ir al analizador</a>
      <section className="hero" id="inicio" aria-labelledby="analysis-title">
        <p className="section-kicker">ANALÍTICA PREDICTIVA · BATERÍAS EV</p>
        <h1 id="analysis-title">Análisis predictivo de <span>salud de baterías</span></h1>
        <p>Evalúa el estado de salud de una batería a partir de su telemetría de descarga y explora su evolución mediante modelos predictivos.</p>
        <div className="hero-facts">
          <span><Icon name="clock" />300 segundos de telemetría</span>
          <span><Icon name="layers" />5 modelos XGBoost</span>
          <span><Icon name="chart" />4 horizontes de predicción</span>
        </div>
      </section>
    </>
  );
}
