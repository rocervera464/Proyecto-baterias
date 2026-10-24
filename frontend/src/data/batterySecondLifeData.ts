export type UseCategory = "Movilidad eléctrica" | "Almacenamiento energético" | "Respaldo y continuidad" | "Baja exigencia" | "Investigación y diagnóstico" | "Recuperación y reciclaje";
export interface BatteryUse {
  id: string;
  title: string;
  category: UseCategory;
  summary: string;
  operation: string;
  requirements: string;
  limitations: string;
  sohConsideration: string;
  scenarios: string[];
}
// applications: orden editorial de prioridad orientativa para cada rango de SoH.
// No representa una puntuación de seguridad o viabilidad técnica.
export interface SohClassification {
  id: string;
  label: string;
  range: string;
  interpretation: string;
  rationale: string;
  applications: BatteryUse[];
}

// Fuente disponible: categorías y aplicaciones de la solicitud del usuario.
// Contenido desarrollado a partir de la solicitud; no se atribuye a un documento externo.
const applications = {
  mobility: {
    id: "mobility", title: "Continuidad en movilidad eléctrica", category: "Movilidad eléctrica",
    summary: "Evaluación de continuidad en el uso automotriz.",
    operation: "Se estudiaría si la batería puede seguir respondiendo al perfil de carga y descarga del vehículo, considerando la capacidad útil y la demanda de potencia.",
    requirements: "Comprobar integridad de celdas y conexiones, potencia disponible, resistencia interna, respuesta térmica y funcionamiento del BMS y de las protecciones del vehículo.",
    limitations: "Un SoH elevado no confirma la aptitud automotriz. La compatibilidad con el fabricante y el estado del conjunto requieren una evaluación independiente.",
  },
  solar: {
    id: "solar", title: "Almacenamiento solar", category: "Almacenamiento energético",
    summary: "Almacenamiento de energía producida por paneles solares.",
    operation: "La batería podría recibir parte de la producción fotovoltaica y devolverla posteriormente mediante un sistema de conversión y control compatible.",
    requirements: "Medir capacidad útil, integridad, resistencia interna y comportamiento térmico. Verificar tensiones, límites de corriente, BMS y compatibilidad del inversor y del controlador de carga.",
    limitations: "La capacidad nominal y el SoH no determinan la energía realmente utilizable ni permiten dimensionar por sí solos el almacenamiento.",
  },
  residentialSolar: {
    id: "residential-solar", title: "Almacenamiento solar residencial", category: "Almacenamiento energético",
    summary: "Evaluación de almacenamiento fotovoltaico en una vivienda.",
    operation: "Se estudiaría cómo almacenar parte de la generación de los paneles y suministrarla posteriormente a través de un inversor y un sistema de gestión compatibles.",
    requirements: "Relacionar el consumo de la vivienda con capacidad y potencia medidas; revisar integridad, resistencia interna, ventilación, comportamiento térmico, BMS y protecciones de la instalación.",
    limitations: "No se puede determinar la autonomía ni la cobertura del consumo únicamente a partir del porcentaje de salud.",
  },
  commercialBackup: {
    id: "commercial-backup", title: "Respaldo para comercios", category: "Respaldo y continuidad",
    summary: "Evaluación de reserva energética para un entorno comercial.",
    operation: "La batería se estudiaría como reserva para alimentar cargas seleccionadas durante una interrupción mediante equipos de conversión y transferencia adecuados.",
    requirements: "Caracterizar cargas y arranques, capacidad útil, potencia, integridad, resistencia interna, calentamiento, BMS y coordinación de las protecciones y la transferencia.",
    limitations: "El SoH no garantiza la continuidad del servicio. No permite asignar cargas críticas ni tiempos de respaldo sin pruebas y dimensionamiento.",
  },
  stationary: {
    id: "stationary", title: "Sistemas estacionarios", category: "Almacenamiento energético",
    summary: "Evaluación de uso en una instalación fija de almacenamiento.",
    operation: "El conjunto podría estudiarse dentro de un sistema fijo con gestión de energía y un perfil de operación definido para su condición real.",
    requirements: "Ensayar capacidad, potencia y resistencia interna; comprobar integridad, dispersión entre celdas, respuesta térmica, BMS, convertidores y protecciones.",
    limitations: "Que la aplicación sea estacionaria no elimina los riesgos ni demuestra que la demanda resulte compatible con la batería.",
  },
  research: {
    id: "research", title: "Investigación controlada", category: "Investigación y diagnóstico",
    summary: "Estudio experimental del comportamiento de la batería.",
    operation: "Se realizarían ensayos definidos para observar su capacidad y respuesta eléctrica y térmica, registrando las condiciones y los resultados.",
    requirements: "Instrumentación adecuada, supervisión técnica, límites de ensayo, control térmico y comprobación de integridad, resistencia interna y protecciones o BMS.",
    limitations: "Los ensayos requieren condiciones controladas; el resultado del modelo no autoriza pruebas improvisadas ni operación sin protección.",
  },
  ups: {
    id: "ups", title: "UPS compatibles", category: "Respaldo y continuidad",
    summary: "Evaluación para sistemas de alimentación ininterrumpida compatibles.",
    operation: "Se estudiaría la respuesta de la batería a los requisitos de carga y descarga y a la transferencia del equipo UPS específico.",
    requirements: "Verificar aceptación del sistema por el fabricante, tensiones y cargador, demanda de potencia, capacidad útil, integridad, resistencia interna, respuesta térmica y comunicación del BMS.",
    limitations: "No toda UPS admite una batería reutilizada ni cualquier química. El SoH no demuestra la compatibilidad eléctrica o de control.",
  },
  microgrid: {
    id: "microgrid", title: "Microredes", category: "Almacenamiento energético",
    summary: "Evaluación como almacenamiento dentro de una microred.",
    operation: "La batería podría estudiarse como parte del balance entre generación y consumo, coordinada por los controles y convertidores de la microred.",
    requirements: "Definir el perfil de demanda y comprobar capacidad, potencia, integridad, resistencia interna, comportamiento térmico, BMS y compatibilidad con la estrategia de control.",
    limitations: "La integración requiere estudiar el sistema completo; el SoH no garantiza estabilidad, disponibilidad ni operación aislada de la red.",
  },
  selfConsumption: {
    id: "self-consumption", title: "Autoconsumo", category: "Almacenamiento energético",
    summary: "Evaluación de aprovechamiento posterior de energía generada localmente.",
    operation: "Se estudiaría el almacenamiento de excedentes para utilizarlos después, de acuerdo con el perfil de generación y consumo de la instalación.",
    requirements: "Medir capacidad útil, integridad, resistencia interna y respuesta térmica; verificar BMS, convertidor, control de energía y límites de carga y descarga.",
    limitations: "No se pueden calcular el ahorro, la energía aprovechable ni los beneficios económicos a partir del SoH aislado.",
  },
  homeBackup: {
    id: "home-backup", title: "Respaldo residencial", category: "Respaldo y continuidad",
    summary: "Evaluación de una reserva de energía para cargas de una vivienda.",
    operation: "Se estudiaría alimentar cargas seleccionadas durante interrupciones, mediante un sistema de respaldo compatible y correctamente dimensionado.",
    requirements: "Evaluar potencia de las cargas, capacidad útil, integridad, resistencia interna, calentamiento, BMS, inversor y dispositivos de protección y transferencia.",
    limitations: "La selección de cargas y su autonomía dependen de mediciones y diseño técnico; no se deducen de la clasificación del SoH.",
  },
  lighting: {
    id: "solar-lighting", title: "Alumbrado solar", category: "Baja exigencia",
    summary: "Evaluación de almacenamiento asociado a iluminación solar.",
    operation: "La batería se estudiaría para almacenar energía fotovoltaica y entregarla a luminarias a través de un controlador compatible.",
    requirements: "Comprobar consumo y demanda de las luminarias, capacidad útil, integridad, resistencia interna, rango térmico de operación, BMS y controlador de carga.",
    limitations: "El porcentaje de salud no permite asegurar iluminación durante un periodo determinado ni sustituye la evaluación de las condiciones del sitio.",
  },
  agriculture: {
    id: "agriculture", title: "Almacenamiento agrícola", category: "Almacenamiento energético",
    summary: "Evaluación de almacenamiento para aplicaciones energéticas agrícolas.",
    operation: "Se estudiarían los perfiles de consumo de la aplicación y su relación con el suministro disponible y las capacidades medidas de la batería.",
    requirements: "Caracterizar potencia, capacidad útil, integridad, resistencia interna, respuesta térmica, BMS y protección frente a las condiciones ambientales del lugar.",
    limitations: "No se presume compatibilidad con motores ni cargas de alta demanda. Cada aplicación requiere un estudio de sus arranques y condiciones de servicio.",
  },
  lowDemand: {
    id: "low-demand", title: "Almacenamiento de baja exigencia", category: "Baja exigencia",
    summary: "Evaluación condicionada de aplicaciones con demanda reducida.",
    operation: "Se estudiaría un perfil de operación limitado a lo que permitan las pruebas de capacidad y potencia, con supervisión de las condiciones de la batería.",
    requirements: "Ensayar integridad, capacidad útil, resistencia interna y respuesta térmica; definir límites de operación y verificar BMS, protecciones y compatibilidad de las cargas.",
    limitations: "Una demanda baja no vuelve segura una batería degradada. No se recomienda reutilizarla si las pruebas especializadas no respaldan esa decisión.",
  },
  sensors: {
    id: "sensors", title: "Sensores remotos", category: "Baja exigencia",
    summary: "Evaluación de suministro a equipos de sensado de baja demanda.",
    operation: "Se estudiaría el consumo continuo y los picos de adquisición o transmisión para comprobar si pueden cubrirse con la energía y potencia disponibles.",
    requirements: "Medir capacidad, autodescarga y resistencia interna; revisar integridad, respuesta térmica, BMS y compatibilidad del regulador y del sensor.",
    limitations: "No se garantiza la autonomía ni la disponibilidad en ubicaciones remotas. La dificultad de mantenimiento y el ambiente requieren evaluación específica.",
  },
  environment: {
    id: "environment", title: "Monitoreo ambiental", category: "Baja exigencia",
    summary: "Evaluación de suministro a equipos de seguimiento ambiental.",
    operation: "Se estudiaría el almacenamiento para el perfil de medición, registro y transmisión del equipo de monitoreo.",
    requirements: "Caracterizar consumos y capacidad útil, revisar integridad, resistencia interna, comportamiento térmico, BMS y protección ambiental y eléctrica del equipo.",
    limitations: "El SoH no permite asegurar continuidad de mediciones ni resistencia a condiciones exteriores. Es necesario valorar el mantenimiento requerido.",
  },
  noncriticalLight: {
    id: "noncritical-light", title: "Iluminación no crítica", category: "Baja exigencia",
    summary: "Evaluación de cargas de iluminación sin función crítica.",
    operation: "Se estudiaría una carga de iluminación limitada a la potencia comprobada de la batería, mediante un controlador o convertidor apropiado.",
    requirements: "Verificar integridad, capacidad, resistencia interna, respuesta térmica, BMS, protecciones y compatibilidad de tensión y corriente de las luminarias.",
    limitations: "No se presenta como solución para iluminación de emergencia o servicios críticos. Incluso las cargas pequeñas requieren protecciones y evaluación.",
  },
  components: {
    id: "components", title: "Evaluación y recuperación de componentes", category: "Recuperación y reciclaje",
    summary: "Estudio especializado de componentes que podrían recuperarse.",
    operation: "Personal especializado evaluaría el conjunto y sus componentes para determinar si existe alguna alternativa de recuperación respaldada por pruebas individuales.",
    requirements: "Procedimientos de manipulación y aislamiento, diagnóstico de integridad, capacidad, resistencia interna y comportamiento térmico, y verificación de protecciones y BMS cuando corresponda.",
    limitations: "El SoH del conjunto no identifica qué componentes son recuperables ni autoriza su desmontaje o combinación con otros módulos.",
  },
  diagnosis: {
    id: "diagnosis", title: "Diagnóstico de módulos", category: "Investigación y diagnóstico",
    summary: "Evaluación especializada de la condición de los módulos.",
    operation: "Se realizarían pruebas individuales para identificar diferencias de capacidad y respuesta eléctrica y térmica entre módulos.",
    requirements: "Inspección de integridad, capacidad útil, resistencia interna, comportamiento térmico y estado del BMS y de las protecciones, con instrumentación y procedimientos especializados.",
    limitations: "El SoH estimado para el conjunto no sustituye el diagnóstico individual ni determina la viabilidad de un módulo concreto.",
  },
  degradation: {
    id: "degradation", title: "Investigación de degradación", category: "Investigación y diagnóstico",
    summary: "Estudio controlado de los cambios asociados al envejecimiento.",
    operation: "Se estudiarían las mediciones de capacidad, resistencia y respuesta térmica para caracterizar la condición observada y sus cambios durante ensayos definidos.",
    requirements: "Trazabilidad de mediciones, integridad del montaje, límites de ensayo, capacidad y resistencia medidas, supervisión térmica y protecciones o BMS adecuados.",
    limitations: "La predicción por sí sola no identifica un mecanismo de fallo ni explica la causa física de la degradación.",
  },
  recovery: {
    id: "recovery", title: "Evaluación de recuperación", category: "Recuperación y reciclaje",
    summary: "Estudio profesional de alternativas de recuperación del conjunto.",
    operation: "Se valorarían opciones de recuperación únicamente a partir de un diagnóstico especializado y de los resultados de las pruebas pertinentes.",
    requirements: "Evaluación de integridad, capacidad, potencia, resistencia interna, respuesta térmica, aislamiento y compatibilidad del BMS y del conjunto resultante.",
    limitations: "Recuperación no equivale a restaurar el SoH. No se garantiza mejora, reutilización ni rentabilidad de la intervención.",
  },
  recycling: {
    id: "recycling", title: "Reciclaje de materiales", category: "Recuperación y reciclaje",
    summary: "Evaluación de gestión especializada y recuperación de materiales.",
    operation: "Se estudiaría la entrega a un gestor especializado que determine el tratamiento apropiado según la química y la condición de la batería.",
    requirements: "Identificación de la batería, evaluación de integridad y condición térmica, manipulación, aislamiento, almacenamiento y transporte mediante procedimientos profesionales.",
    limitations: "El SoH no define por sí solo el tratamiento ni permite asegurar materiales recuperables. No es una instrucción de desensamble o procesamiento doméstico.",
  },
  sorting: {
    id: "sorting", title: "Clasificación profesional de celdas y módulos", category: "Recuperación y reciclaje",
    summary: "Clasificación individual basada en mediciones especializadas.",
    operation: "Se compararían mediciones individuales para documentar diferencias entre componentes y sustentar decisiones profesionales de gestión.",
    requirements: "Pruebas de capacidad, potencia, integridad, resistencia interna, comportamiento térmico y compatibilidad, con trazabilidad y procedimientos de protección y manipulación.",
    limitations: "No se puede clasificar un componente mediante el SoH global del conjunto ni garantizar que componentes separados puedan combinarse.",
  },
} satisfies Record<string, Omit<BatteryUse, "sohConsideration" | "scenarios">>;

const useDetails: Record<keyof typeof applications, Pick<BatteryUse, "sohConsideration" | "scenarios">> = {
  mobility: { sohConsideration: "La capacidad remanente puede motivar una revisión de continuidad automotriz, pero la aceleración, los picos de potencia y la gestión térmica deben evaluarse aparte del SoH.", scenarios: ["Evaluación de continuidad en el vehículo de origen.", "Comparación entre la capacidad medida y las exigencias del perfil de uso del vehículo."] },
  solar: { sohConsideration: "En almacenamiento fotovoltaico puede estudiarse una demanda distinta de la tracción. La capacidad restante debe contrastarse con la energía a almacenar y con la potencia del sistema solar.", scenarios: ["Evaluación de almacenamiento de excedentes fotovoltaicos.", "Estudio de suministro posterior a cargas seleccionadas de una instalación solar."] },
  residentialSolar: { sohConsideration: "La capacidad estimada sirve como punto de partida para valorar almacenamiento doméstico; no determina qué consumos de la vivienda pueden cubrirse ni durante cuánto tiempo.", scenarios: ["Estudio de aprovechamiento posterior de excedentes de paneles de una vivienda.", "Evaluación de cargas domésticas seleccionadas con un inversor compatible."] },
  commercialBackup: { sohConsideration: "Para respaldo comercial importan tanto la energía disponible como la potencia durante una interrupción. El SoH solo aproxima una parte del problema y no respalda por sí solo un servicio de continuidad.", scenarios: ["Evaluación de cargas comerciales no críticas durante interrupciones.", "Estudio de una reserva energética para equipos previamente caracterizados."] },
  stationary: { sohConsideration: "Un montaje fijo permite estudiar perfiles de operación específicos, pero la capacidad reducida sigue limitando la energía disponible y deben medirse los límites reales del conjunto.", scenarios: ["Caracterización de un sistema fijo de almacenamiento con cargas seleccionadas.", "Evaluación de integración con un convertidor y un gestor de energía compatibles."] },
  research: { sohConsideration: "Distintos estados de salud pueden ser relevantes para estudiar el comportamiento eléctrico y térmico. La condición degradada exige controles de ensayo y no constituye un permiso de reutilización.", scenarios: ["Comparación de ensayos de capacidad realizados bajo condiciones documentadas.", "Observación de respuesta térmica y eléctrica dentro de límites de ensayo definidos."] },
  ups: { sohConsideration: "Un SoH relativamente conservado puede motivar pruebas de respaldo, pero no garantiza la descarga requerida por una UPS ni la aceptación de la batería por su cargador y control.", scenarios: ["Evaluación en banco con un modelo de UPS que admita la química y configuración.", "Comprobación de capacidad y respuesta ante las cargas previstas para el respaldo."] },
  microgrid: { sohConsideration: "La capacidad remanente podría estudiarse como reserva distribuida, siempre que la potencia y la respuesta de la batería sean compatibles con las funciones previstas en la microred.", scenarios: ["Estudio de almacenamiento asociado a generación local.", "Evaluación de apoyo a cargas seleccionadas bajo la gestión energética de una microred."] },
  selfConsumption: { sohConsideration: "La reducción de capacidad condiciona cuánto excedente puede aprovecharse. Deben conocerse generación, consumo y pérdidas, además del SoH, para evaluar el autoconsumo.", scenarios: ["Estudio del traslado de excedentes de generación a otro periodo de consumo.", "Comparación entre el perfil de consumo local y la capacidad útil medida de almacenamiento."] },
  homeBackup: { sohConsideration: "La segunda vida podría valorarse para cargas domésticas seleccionadas. La capacidad útil y la potencia ensayadas deben respaldar cualquier expectativa de suministro durante una interrupción.", scenarios: ["Evaluación de respaldo para cargas residenciales no críticas.", "Estudio del comportamiento de un conjunto batería-inversor ante las cargas previstas."] },
  lighting: { sohConsideration: "El consumo de ciertas luminarias podría justificar estudiar una aplicación de menor demanda, sin asumir que el SoH garantice cobertura de las horas sin generación solar.", scenarios: ["Estudio de almacenamiento para luminarias solares de uso no crítico.", "Evaluación del balance entre generación del panel, almacenamiento e iluminación prevista."] },
  agriculture: { sohConsideration: "La capacidad restante debe contrastarse con la aplicación agrícola concreta; una carga de monitoreo y un motor pueden requerir potencias muy diferentes aunque utilicen la misma reserva de energía.", scenarios: ["Evaluación de almacenamiento para equipos de monitoreo agrícola.", "Estudio de reserva asociada a generación local y cargas rurales previamente caracterizadas."] },
  lowDemand: { sohConsideration: "En un rango de degradación alta solo procede estudiar demandas limitadas y controladas. La menor exigencia no compensa defectos de integridad ni un comportamiento térmico anómalo.", scenarios: ["Ensayo supervisado con una carga de baja demanda definida.", "Evaluación de una reserva limitada para un sistema no crítico previamente caracterizado."] },
  sensors: { sohConsideration: "Un consumo medio reducido puede justificar un estudio, pero la pérdida de capacidad, la autodescarga y los picos de transmisión pueden limitar de forma distinta un nodo de sensado.", scenarios: ["Evaluación del suministro a un nodo de sensado no crítico.", "Ensayo del consumo durante adquisición de datos y transmisión del sensor."] },
  environment: { sohConsideration: "La capacidad estimada debe relacionarse con los ciclos de medición y transmisión. El SoH no describe la exposición ambiental ni el mantenimiento necesario para conservar las mediciones.", scenarios: ["Estudio del suministro a un registrador ambiental no crítico.", "Evaluación de la demanda de una estación de medición con transmisión periódica."] },
  noncriticalLight: { sohConsideration: "Una carga de iluminación limitada podría estudiarse bajo supervisión. La degradación alta impide dar por asegurados potencia, duración o disponibilidad a partir del porcentaje.", scenarios: ["Ensayo de iluminación auxiliar sin función de emergencia.", "Evaluación de una luminaria con controlador compatible y consumo medido."] },
  components: { sohConsideration: "Un SoH global reducido puede motivar diagnóstico de componentes, pero no permite identificar cuáles conservarían capacidad, integridad o compatibilidad suficientes para recuperarse.", scenarios: ["Diagnóstico profesional de componentes del conjunto.", "Evaluación individual para decidir entre recuperación o gestión especializada."] },
  diagnosis: { sohConsideration: "Por debajo del 60 %, el resultado orienta hacia diagnóstico especializado. Las mediciones individuales permiten estudiar diferencias que el SoH agregado no revela.", scenarios: ["Comparación profesional de capacidad y resistencia entre módulos.", "Inspección de integridad y respuesta térmica antes de decidir su gestión."] },
  degradation: { sohConsideration: "Un SoH bajo puede ser relevante para investigar envejecimiento, pero no identifica por sí mismo los mecanismos físicos ni la causa de las diferencias entre componentes.", scenarios: ["Comparación de capacidad y resistencia bajo protocolos documentados.", "Estudio controlado de cambios eléctricos y térmicos durante ensayos."] },
  recovery: { sohConsideration: "En este rango, recuperar cualquier elemento es una posibilidad que debe investigarse mediante pruebas; no puede inferirse una mejora del conjunto ni la existencia de una alternativa viable.", scenarios: ["Estudio profesional de alternativas después del diagnóstico.", "Comparación técnica entre recuperación de elementos y gestión para reciclaje."] },
  recycling: { sohConsideration: "Una salud estimada baja motiva valorar gestión especializada, pero la ruta de tratamiento depende también de la química, la integridad y las condiciones del conjunto.", scenarios: ["Evaluación de entrega a un gestor especializado.", "Identificación profesional de la química y condición para determinar el tratamiento."] },
  sorting: { sohConsideration: "El SoH agregado no permite agrupar componentes por equivalencia. La clasificación requiere resultados individuales y no implica que las celdas o módulos puedan volver a combinarse.", scenarios: ["Registro profesional de mediciones individuales de celdas o módulos.", "Separación técnica de alternativas de diagnóstico, recuperación o reciclaje."] },
};

function getApplication(key: keyof typeof applications): BatteryUse {
  return { ...applications[key], ...useDetails[key] };
}

export const secondLifeClassifications: SohClassification[] = [
  { id: "excellent", label: "Excelente", range: "90–100 %", interpretation: "La capacidad estimada justifica estudiar la continuidad de uso y otras aplicaciones, siempre con verificación técnica independiente.", rationale: "En este rango, la capacidad restante estimada es relativamente alta. Esto permite plantear la evaluación de la aplicación, sin confirmar potencia, integridad ni compatibilidad.", applications: [getApplication("mobility"), getApplication("solar"), getApplication("commercialBackup"), getApplication("stationary"), getApplication("research")] },
  { id: "good", label: "Buen estado", range: "80–menos de 90 %", interpretation: "Podría evaluarse la continuidad automotriz o el almacenamiento y respaldo, según la capacidad y potencia realmente medidas.", rationale: "El SoH sugiere capacidad remanente que merece evaluación para estos usos; los requisitos de cada sistema deben contrastarse con pruebas de la batería.", applications: [getApplication("mobility"), getApplication("residentialSolar"), getApplication("commercialBackup"), getApplication("ups"), getApplication("microgrid"), getApplication("selfConsumption")] },
  { id: "second-life", label: "Candidato a segunda vida", range: "70–menos de 80 %", interpretation: "Esta batería conserva una capacidad estimada que podría permitir evaluar su utilización en aplicaciones estacionarias menos exigentes que la movilidad eléctrica.", rationale: "La capacidad estimada podría motivar una evaluación de segunda vida. Es necesario comprobar si la aplicación exige menos de lo que la batería puede entregar de forma controlada.", applications: [getApplication("solar"), getApplication("homeBackup"), getApplication("microgrid"), getApplication("lighting"), getApplication("agriculture"), getApplication("stationary")] },
  { id: "high-degradation", label: "Degradación alta", range: "60–menos de 70 %", interpretation: "La degradación estimada requiere cautela. Solo corresponde estudiar usos de baja exigencia, investigación controlada o recuperación con evaluación especializada.", rationale: "La capacidad reducida limita las alternativas. La aplicación solo merece consideración si pruebas adicionales respaldan su operación y sus límites específicos.", applications: [getApplication("lowDemand"), getApplication("sensors"), getApplication("environment"), getApplication("noncriticalLight"), getApplication("research"), getApplication("components")] },
  { id: "specialist", label: "Evaluación especializada", range: "0–menos de 60 %", interpretation: "Se debe priorizar el diagnóstico especializado para estudiar recuperación, clasificación o reciclaje, sin asumir que exista una alternativa de reutilización.", rationale: "Este rango orienta hacia diagnóstico y gestión profesional, más que hacia una aplicación energética. El SoH no determina por sí solo qué componentes o materiales podrían recuperarse.", applications: [getApplication("diagnosis"), getApplication("degradation"), getApplication("recovery"), getApplication("recycling"), getApplication("sorting")] },
];

export function getSohClassification(soh: unknown): SohClassification | null {
  if (typeof soh !== "number" || !Number.isFinite(soh) || soh < 0 || soh > 100) return null;
  return secondLifeClassifications[soh >= 90 ? 0 : soh >= 80 ? 1 : soh >= 70 ? 2 : soh >= 60 ? 3 : 4];
}
