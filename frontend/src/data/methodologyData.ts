export type VisualKind = "dataset" | "cleaning" | "features" | "trees" | "metrics" | "integration" | "telemetry" | "window" | "models" | "results" | "soh";
export interface JourneyStep { short: string; title: string; description: string; points: string[]; evidenceTitle: string; evidence: string; technical: string; visual: VisualKind; }
export const trainingSteps: JourneyStep[] = [
  {
    "short": "Datos",
    "title": "Aprender de mediciones reales",
    "visual": "dataset",
    "description": "Se estudian ocho celdas NASA en dos protocolos, evaluados por separado.",
    "points": [
      "Se conservan los archivos MAT originales y sus huellas SHA-256.",
      "La capacidad medida crea la referencia de SoH, no una entrada del modelo.",
      "Cargar un archivo realiza inferencia; no vuelve a entrenar."
    ],
    "evidenceTitle": "Fuentes trazables",
    "evidence": "277 descargas con capacidad positiva en la familia de 1 A y 636 en la familia de 2 A. Son datos de desarrollo, no una prueba externa independiente.",
    "technical": "SoH = capacidad / mediana de las primeras cinco capacidades positivas y finitas de la misma celda por 100. Los protocolos no se mezclan."
  },
  {
    "short": "Preparaci\u00f3n",
    "title": "Interpretar y ordenar las se\u00f1ales",
    "visual": "cleaning",
    "description": "Una sola ruta prepara archivos de texto, hojas de c\u00e1lculo y datos MATLAB.",
    "points": [
      "Se reconocen aliases y unidades declaradas.",
      "Se selecciona una sola descarga y se ordena por tiempo.",
      "Se eliminan duplicados id\u00e9nticos; las mediciones contradictorias se rechazan."
    ],
    "evidenceTitle": "Limpieza compartida",
    "evidence": "El entrenamiento y la API reutilizan clean_telemetry y extract_telemetry_features. No se inventan variables ausentes.",
    "technical": "Se analiza 0 <= time_s <= 300. Filas inv\u00e1lidas aisladas se descartan solo con una proporci\u00f3n <= 5%; los bloques incompletos se rechazan."
  },
  {
    "short": "Variables",
    "title": "Caracter\u00edsticas solo de telemetr\u00eda",
    "visual": "features",
    "description": "La entrada del modelo procede exclusivamente de tiempo, voltaje, corriente y temperatura.",
    "points": [
      "Las 21 estad\u00edsticas base describen voltaje, corriente y temperatura.",
      "Se compararon pendientes, integrales, potencia y cambios entre mitades.",
      "La selecci\u00f3n se realiza por bater\u00eda; no por error de entrenamiento."
    ],
    "evidenceTitle": "Contratos v4",
    "evidence": "La familia de 1 A seleccion\u00f3 21 variables; la familia de 2 A, 30. No se utilizan ciclo, ambiente, corte, EIS ni carga previa.",
    "technical": "Conjuntos A/B/C/D comparados en validaci\u00f3n interna. El manifiesto y los modelos verifican nombres y orden exacto."
  },
  {
    "short": "XGBoost",
    "title": "Salud actual y degradaci\u00f3n acumulada",
    "visual": "trees",
    "description": "Cada familia contiene un XGBoost de SoH actual y un \u00fanico XGBoost para la degradaci\u00f3n futura.",
    "points": [
      "El modelo actual aprende la capacidad relativa de referencia.",
      "El modelo futuro recibe adem\u00e1s horizon_cycles.",
      "Se compararon variantes libres y monot\u00f3nicas."
    ],
    "evidenceTitle": "Modelos entrenados",
    "evidence": "Los artefactos JSON contienen \u00e1rboles ajustados con los datos NASA, no salidas simuladas.",
    "technical": "Degradaci\u00f3n objetivo = max(0, SoH real actual - SoH real futuro). SoH futuro = SoH actual estimado - degradaci\u00f3n estimada, con l\u00edmites documentados."
  },
  {
    "short": "Evaluaci\u00f3n",
    "title": "Medir la generalizaci\u00f3n por bater\u00eda",
    "visual": "metrics",
    "description": "Cada bater\u00eda se reserva una vez para prueba y se mantiene fuera de las decisiones de ajuste.",
    "points": [
      "Leave-One-Battery-Out externo e interno.",
      "MAE, RMSE, R\u00b2, error mediano y sesgo por bater\u00eda y horizonte.",
      "Baselines de media, persistencia y degradaci\u00f3n hist\u00f3rica."
    ],
    "evidenceTitle": "Evaluaci\u00f3n reproducible",
    "evidence": "Los informes registran particiones por bater\u00eda y selecciones internas. No hay validaci\u00f3n externa de veh\u00edculos ni paquetes.",
    "technical": "La bater\u00eda externa no interviene en early stopping ni en la selecci\u00f3n. La coherencia temporal no sustituye las m\u00e9tricas de precisi\u00f3n."
  },
  {
    "short": "Integraci\u00f3n",
    "title": "De los artefactos a los resultados",
    "visual": "integration",
    "description": "FastAPI verifica los modelos, transforma las se\u00f1ales y devuelve sus predicciones.",
    "points": [
      "La carga de modelos se reutiliza mediante cach\u00e9.",
      "Cada horizonte conserva el estado de validaci\u00f3n del manifiesto.",
      "React conserva los valores num\u00e9ricos recibidos."
    ],
    "evidenceTitle": "Contrato de producci\u00f3n",
    "evidence": "POST /api/v1/predict acepta solo discharge_samples; POST /api/v1/predict-file interpreta el archivo completo.",
    "technical": "Se comprueban contratos de features, objetivos, evaluaci\u00f3n e integridad SHA-256. El ciclo puede estar ausente y la gr\u00e1fica utiliza horizontes relativos."
  }
];
export const predictionSteps: JourneyStep[] = [
  {
    "short": "Telemetr\u00eda",
    "title": "Cargar las cuatro se\u00f1ales",
    "visual": "telemetry",
    "description": "Carga un archivo o pega las mediciones de una sola descarga.",
    "points": [
      "Tiempo, voltaje, corriente y temperatura.",
      "No necesitas proporcionar el ciclo, el voltaje de corte ni el ambiente.",
      "Se aceptan CSV, TSV, TXT, JSON, XLSX, XLS, Parquet y MAT."
    ],
    "evidenceTitle": "Importaci\u00f3n autom\u00e1tica",
    "evidence": "La vista previa muestra el archivo, su formato, las muestras y las variables reconocidas.",
    "technical": "Los aliases se comparan de forma determinista; las columnas ambiguas se rechazan."
  },
  {
    "short": "Ventana",
    "title": "Utilizar los primeros 300 segundos",
    "visual": "window",
    "description": "Las mediciones se ordenan y se conserva la ventana temprana de descarga.",
    "points": [
      "El segundo 300 est\u00e1 incluido.",
      "Las muestras posteriores no participan en las features.",
      "La cantidad y cobertura se contrastan con el entrenamiento."
    ],
    "evidenceTitle": "Muestreo observado",
    "evidence": "Se requieren al menos 21 muestras para la familia de 1 A y 17 para la de 2 A, adem\u00e1s de cobertura temporal suficiente.",
    "technical": "Se compararon ventanas de 60, 120, 180, 300 y 600 s. La ruta productiva conserva 300 s."
  },
  {
    "short": "Variables",
    "title": "Caracter\u00edsticas solo de telemetr\u00eda",
    "visual": "features",
    "description": "La entrada del modelo procede exclusivamente de tiempo, voltaje, corriente y temperatura.",
    "points": [
      "Las 21 estad\u00edsticas base describen voltaje, corriente y temperatura.",
      "Se compararon pendientes, integrales, potencia y cambios entre mitades.",
      "La selecci\u00f3n se realiza por bater\u00eda; no por error de entrenamiento."
    ],
    "evidenceTitle": "Contratos v4",
    "evidence": "La familia de 1 A seleccion\u00f3 21 variables; la familia de 2 A, 30. No se utilizan ciclo, ambiente, corte, EIS ni carga previa.",
    "technical": "Conjuntos A/B/C/D comparados en validaci\u00f3n interna. El manifiesto y los modelos verifican nombres y orden exacto."
  },
  {
    "short": "Inferencia",
    "title": "Ejecutar XGBoost con las se\u00f1ales",
    "visual": "models",
    "description": "El perfil observado selecciona la familia compatible y el modelo estima SoH.",
    "points": [
      "No se inventan metadatos para forzar la compatibilidad.",
      "La capacidad real no se solicita ni entra al modelo.",
      "Las proyecciones solo se ejecutan si est\u00e1n habilitadas."
    ],
    "evidenceTitle": "Sin ajustes visuales",
    "evidence": "La API devuelve la predicci\u00f3n del modelo y sus detalles de compatibilidad. React no recalcula el resultado.",
    "technical": "La degradaci\u00f3n futura recibe las features seleccionadas y el horizonte; nunca el SoH futuro real."
  },
  {
    "short": "Resultados",
    "title": "Consultar salud y horizontes habilitados",
    "visual": "results",
    "description": "La interfaz muestra el estado actual y las proyecciones, indicando sus l\u00edmites de precisi\u00f3n.",
    "points": [
      "Los porcentajes proceden de FastAPI.",
      "Los segmentos de la gr\u00e1fica conectan horizontes discretos.",
      "Una curva plana no demuestra ausencia de degradaci\u00f3n."
    ],
    "evidenceTitle": "Estado de validaci\u00f3n visible",
    "evidence": "Las cuatro proyecciones est\u00e1n habilitadas como estimaciones de precisi\u00f3n limitada. Sus m\u00e9tricas de evaluaci\u00f3n se conservan.",
    "technical": "future_predictions coincide con forecast_horizons; production_horizons y validation_status conservan la aprobaci\u00f3n cient\u00edfica. No se inventan valores."
  },
  {
    "short": "Interpretaci\u00f3n",
    "title": "Interpretar capacidad relativa",
    "visual": "soh",
    "description": "El porcentaje compara la capacidad con la referencia inicial de la celda.",
    "points": [
      "SoH y carga disponible son magnitudes distintas.",
      "La clasificaci\u00f3n es orientativa.",
      "La segunda vida requiere una evaluaci\u00f3n adicional."
    ],
    "evidenceTitle": "Alcance limitado",
    "evidence": "Un porcentaje de SoH no certifica seguridad ni estima los ciclos de vida restantes.",
    "technical": "La evaluaci\u00f3n disponible se limita a cuatro celdas por protocolo; no demuestra generalizaci\u00f3n a cualquier bater\u00eda EV."
  }
];
