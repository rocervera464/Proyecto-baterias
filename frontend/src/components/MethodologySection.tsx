export default function MethodologySection() {
  return <section data-reveal className="methodology card" id="metodologia" aria-labelledby="methodology-title">
    <p className="section-kicker">METODOLOGÍA Y LIMITACIONES</p>
    <h2 id="methodology-title">Del dato a la estimación</h2>
    <details>
      <summary>¿Cómo funciona el análisis?</summary>
      <ol className="methodology-steps">
        <li><strong>Carga de telemetría</strong><p>Se validan tiempo, voltaje, corriente y temperatura, con las unidades y el origen temporal seleccionados.</p></li>
        <li><strong>Ventana de 300 segundos</strong><p>Se ordenan las muestras y se utiliza la ventana inicial de la descarga.</p></li>
        <li><strong>29 características</strong><p>El backend extrae estadísticas de las señales y combina los parámetros de la batería y los datos previos disponibles.</p></li>
        <li><strong>Cinco modelos XGBoost</strong><p>Los modelos se entrenaron previamente. El frontend envía los datos para inferencia y el backend produce las predicciones.</p></li>
        <li><strong>Interpretación del SoH</strong><p>El estado actual y los horizontes +5, +10, +20 y +30 son estimaciones discretas de modelos diferentes. +20 y +30 son experimentales por su menor estabilidad en validación.</p></li>
      </ol>
      <p className="notice">El SoH no certifica la seguridad ni la viabilidad de reutilización. No existe todavía un modelo formal de vida útil restante (RUL); estas predicciones no indican cuántos ciclos le quedan a la batería.</p>
    </details>
  </section>;
}
