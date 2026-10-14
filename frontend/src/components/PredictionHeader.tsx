export default function PredictionHeader() {
  return (
    <header className="hero">
      <h1>Predictor del estado de salud de baterías</h1>
      <p>
        Carga la telemetría de una descarga para estimar el Estado de Salud
        actual y su evolución futura mediante XGBoost.
      </p>
    </header>
  );
}
