import Icon from "./Icon";

export default function PredictionHeader() {
  return (
    <>
      <a className="skip-link" href="#analizador">Ir al analizador</a>
      <section className="hero" id="inicio" aria-labelledby="analysis-title">
        <p data-reveal className="section-kicker">ANALÍTICA PREDICTIVA · BATERÍAS EV</p>
        <h1 data-reveal data-reveal-delay="1" id="analysis-title" className="hero-title">
          <span className="hero-brand"><img src="/brand-logo.svg" alt="" width="72" height="72" /><span className="hero-brand-name">Bater<span className="hero-brand-ai">IA</span></span></span>
          <span className="hero-title-description">Predicción de la salud <span>de tu batería</span></span>
        </h1>
        <svg className="hero-energy-line" viewBox="0 0 320 36" fill="none" aria-hidden="true"><path className="energy-track" d="M1 18h105l12-10 15 20 18-26 17 32 15-24 13 8h123" /><path className="energy-pulse" d="M1 18h105l12-10 15 20 18-26 17 32 15-24 13 8h123" /></svg>
        <p data-reveal data-reveal-delay="2">Evalúa el estado de salud de una batería a partir de su telemetría de descarga y explora su evolución mediante modelos predictivos.</p>
        <div className="hero-actions" data-reveal data-reveal-delay="3">
          <a className="hero-primary-action" href="#parametros">Analizar mi batería <span aria-hidden="true">→</span></a>
          <a className="hero-secondary-action" href="#metodologia">Conocer el modelo <span aria-hidden="true">↗</span></a>
        </div>
        <div data-reveal data-reveal-delay="3" className="hero-facts">
          <span><Icon name="clock" />300 segundos de telemetría</span>
          <span><Icon name="layers" />5 modelos XGBoost</span>
          <span><Icon name="chart" />4 horizontes de predicción</span>
        </div>
      </section>
    </>
  );
}
