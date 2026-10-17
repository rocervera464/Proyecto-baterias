export interface FeatureGroup { label: string; description: string; features: [string, string][]; }

// Documented from backend/model_artifacts/features.json in its exact order.
export const featureGroups: FeatureGroup[] = [
  {
    "label": "Contexto",
    "description": "Condiciones del ciclo analizado.",
    "features": [
      [
        "cycle",
        "Ciclo actual"
      ],
      [
        "ambient_temperature",
        "Temperatura ambiente"
      ],
      [
        "cutoff_voltage",
        "Voltaje de corte"
      ]
    ]
  },
  {
    "label": "Voltaje",
    "description": "Siete estadísticas de las muestras de 0 a 300 s. Unidad: V.",
    "features": [
      [
        "voltage_start",
        "Valor inicial"
      ],
      [
        "voltage_mean",
        "Media aritmética"
      ],
      [
        "voltage_std",
        "Desviación estándar poblacional"
      ],
      [
        "voltage_min",
        "Valor mínimo"
      ],
      [
        "voltage_max",
        "Valor máximo"
      ],
      [
        "voltage_end",
        "Valor final"
      ],
      [
        "voltage_delta",
        "Cambio: final menos inicial"
      ]
    ]
  },
  {
    "label": "Corriente",
    "description": "Siete estadísticas de las muestras de 0 a 300 s. Unidad: A.",
    "features": [
      [
        "current_start",
        "Valor inicial"
      ],
      [
        "current_mean",
        "Media aritmética"
      ],
      [
        "current_std",
        "Desviación estándar poblacional"
      ],
      [
        "current_min",
        "Valor mínimo"
      ],
      [
        "current_max",
        "Valor máximo"
      ],
      [
        "current_end",
        "Valor final"
      ],
      [
        "current_delta",
        "Cambio: final menos inicial"
      ]
    ]
  },
  {
    "label": "Temperatura",
    "description": "Siete estadísticas de las muestras de 0 a 300 s. Unidad: °C.",
    "features": [
      [
        "temperature_start",
        "Valor inicial"
      ],
      [
        "temperature_mean",
        "Media aritmética"
      ],
      [
        "temperature_std",
        "Desviación estándar poblacional"
      ],
      [
        "temperature_min",
        "Valor mínimo"
      ],
      [
        "temperature_max",
        "Valor máximo"
      ],
      [
        "temperature_end",
        "Valor final"
      ],
      [
        "temperature_delta",
        "Cambio: final menos inicial"
      ]
    ]
  },
  {
    "label": "EIS previo",
    "description": "Impedancias opcionales de una medición anterior. Si faltan, se representan como NaN.",
    "features": [
      [
        "Re_prev",
        "Resistencia del electrolito (Ω)"
      ],
      [
        "Rct_prev",
        "Resistencia de transferencia de carga (Ω)"
      ]
    ]
  },
  {
    "label": "Carga previa",
    "description": "Temperaturas opcionales de la carga anterior (°C). El backend conserva los valores enviados.",
    "features": [
      [
        "charge_temp_start_prev",
        "Temperatura inicial"
      ],
      [
        "charge_temp_max_prev",
        "Temperatura máxima"
      ],
      [
        "charge_temp_delta_prev",
        "Cambio de temperatura"
      ]
    ]
  }
];
