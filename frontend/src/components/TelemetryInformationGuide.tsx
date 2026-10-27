import "./telemetryInformationGuide.css";

const measurements = [
  ["Tiempo", "time_s · segundos (s)", "Tiempo transcurrido desde el inicio de la descarga. Permite ordenar la serie y seleccionar la ventana de 0–300 s.", "Busca Time, Elapsed time, Tiempo o una columna de fecha y hora en el registro del ensayo. Si solo tienes marcas de fecha y hora, el importador puede convertirlas; en ingreso manual usa los segundos desde el inicio real de la descarga."],
  ["Voltaje", "voltage_v · voltios (V)", "Tensión eléctrica medida en la batería o celda en ese instante. No es el voltaje nominal de la etiqueta ni el voltaje de corte.", "Busca Voltage measured, Voltage, Voltaje o Tensión en el registro de descarga del equipo de ensayo o del sistema de gestión de la batería (BMS). Comprueba si corresponde a una celda, un módulo o el paquete completo."],
  ["Corriente", "current_a · amperios (A)", "Corriente que entra o sale de la batería. Su signo indica la convención del equipo; los datos de entrenamiento utilizan corriente negativa durante la descarga.", "Busca Current measured, Current o Corriente en el mismo registro. Consulta la convención de signos del exportador. El modo CSV permite invertir el signo; en modo manual introduce el signo correcto, sin cambiarlo por suposición."],
  ["Temperatura", "temperature_c · grados Celsius (°C)", "Temperatura medida por el sensor de la batería durante la descarga. Es distinta de la temperatura del ambiente.", "Busca Temperature measured, Battery temperature o Temperatura de batería en el registro. Si hay varios sensores, identifica cuál representa la medición que vas a analizar y mantén el mismo criterio durante toda la serie."],
];
const parameters = [
  ["Ciclo actual de carga", "cycle · número entero", "Identifica el ciclo de la medición. Localízalo en el contador de ciclos del equipo o en el historial del ensayo. El entrenamiento cuenta ciclos de descarga; verifica que el contador de tu fuente sea comparable. No uses el número de filas ni el de veces que se conectó el cargador como sustituto."],
  ["Temperatura ambiente", "ambient_temperature_c · °C", "Temperatura del entorno durante la prueba. Búscala en la configuración de la cámara de ensayo, en el sensor ambiental o en el informe de la medición. No copies aquí la temperatura de la batería ni la temperatura actual de otra fecha."],
  ["Voltaje de corte", "cutoff_voltage_v · V", "Umbral configurado para detener la descarga. Búscalo en los parámetros del ensayo o en el informe del equipo. No lo deduzcas del último voltaje del archivo; debe estar en la misma escala de celda o paquete que las mediciones enviadas."],
];


export default function TelemetryInformationGuide() {
  return <details className="telemetry-information-guide">
    <summary>¿Dónde encontrar esta información?</summary>
    <div className="telemetry-guide-content">
      <p>Necesitas un registro de descarga: una serie de mediciones de la misma batería a lo largo del tiempo. Puede proceder del equipo de ensayo, de un registrador de datos o del software del BMS, si permite exportarlas. Los nombres y las opciones de exportación varían según el fabricante.</p>
      <h4>Paso a paso para buscar tus datos</h4>
      <ol className="telemetry-guide-steps">
        <li><strong>Identifica la batería y la prueba.</strong> Abre el software o el informe que acompañe la medición. Anota el identificador de la batería, el ciclo y la fecha. La etiqueta de la batería por sí sola no contiene la serie temporal necesaria.</li>
        <li><strong>Localiza el registro de descarga.</strong> Busca apartados como «Historial», «Registro de mediciones», «Datos del ensayo» o «Exportar». Son nombres orientativos, no rutas universales. Selecciona un solo ciclo y evita mezclar carga, reposo y descarga.</li>
        <li><strong>Busca las cuatro señales.</strong> Comprueba que haya tiempo, voltaje, corriente y temperatura de batería para cada instante. Si falta alguna, solicita el registro completo a quien realizó la prueba; no la sustituyas por un valor supuesto.</li>
        <li><strong>Revisa las unidades y el origen temporal.</strong> Distingue V de mV y A de mA. En modo CSV puedes elegir las unidades y el origen del tiempo. En modo manual introduce s, V, A y °C, con tiempo transcurrido desde el inicio de la descarga.</li>
        <li><strong>Recupera los parámetros del ensayo.</strong> Consulta el ciclo, la temperatura ambiente y el voltaje de corte en la configuración o el informe. Indica también la química y el nivel de medición si los conoces.</li>
        <li><strong>Importa o transcribe y revisa.</strong> Exporta CSV/TSV/JSON si está disponible, o copia las cuatro columnas en el editor manual. Usa la vista previa para verificar las señales. El sistema necesita al menos dos instantes distintos entre 0 y 300 s; ese mínimo no garantiza precisión.</li>
      </ol>
      <details><summary>Mediciones de cada fila: qué significan y dónde buscarlas</summary><div className="telemetry-variable-grid">{measurements.map(([name, key, meaning, location]) => <article key={name}><h4>{name}</h4><span className="telemetry-variable-unit">{key}</span><p>{meaning}</p><p><strong>Dónde buscar:</strong> {location}</p></article>)}</div></details>
      <details><summary>Parámetros generales de la batería</summary><dl className="telemetry-variable-list">{parameters.map(([name, unit, description]) => <div key={name}><dt>{name}<span>{unit}</span></dt><dd>{description}</dd></div>)}</dl></details>
      <div className="telemetry-guide-note"><strong>Antes de usar un registro de vehículo</strong><p>Comprueba si las señales son de una celda o de todo el paquete. Las familias disponibles se entrenaron con celdas NASA a 4 °C y a temperatura ambiente. Convertir las unidades o dividir el voltaje del paquete no valida por sí solo su aplicación a otra batería. SoC es carga disponible y SoH es salud estimada: ninguna de esas columnas reemplaza las cuatro mediciones de entrada.</p></div>
    </div>
  </details>;
}
