export default function PredictionHeader() {
  return (
    <header className="hero">
      <h1>Predictor del estado de salud de baterías</h1>
      <p>
        Carga la telemetría de una descarga para estimar el Estado de Salud
        actual y su evolución futura mediante XGBoost.
      </p>
      <img
        className="hero-image"
        src="/battery-header.jpg"
        alt="Vehículo eléctrico, baterías y gráficos de análisis en una ciudad futurista"
        width={1376}
        height={768}
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
    </header>
  );
}
