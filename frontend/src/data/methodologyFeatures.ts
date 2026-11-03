export interface FeatureGroup { label: string; description: string; features: [string, string][]; }
// Telemetry-only v4: common statistics and evaluated derived signals.
export const featureGroups: FeatureGroup[] = [
  {
    "label": "Voltaje",
    "description": "Estad\u00edsticas de las muestras de 0 a 300 segundos. Unidad: V",
    "features": [
      [
        "voltage_start",
        "Valor inicial"
      ],
      [
        "voltage_mean",
        "Media aritm\u00e9tica"
      ],
      [
        "voltage_std",
        "Desviaci\u00f3n est\u00e1ndar poblacional"
      ],
      [
        "voltage_min",
        "Valor m\u00ednimo"
      ],
      [
        "voltage_max",
        "Valor m\u00e1ximo"
      ],
      [
        "voltage_end",
        "Valor final"
      ],
      [
        "voltage_delta",
        "Cambio final menos inicial"
      ]
    ]
  },
  {
    "label": "Corriente",
    "description": "Estad\u00edsticas de las muestras de 0 a 300 segundos. Unidad: A",
    "features": [
      [
        "current_start",
        "Valor inicial"
      ],
      [
        "current_mean",
        "Media aritm\u00e9tica"
      ],
      [
        "current_std",
        "Desviaci\u00f3n est\u00e1ndar poblacional"
      ],
      [
        "current_min",
        "Valor m\u00ednimo"
      ],
      [
        "current_max",
        "Valor m\u00e1ximo"
      ],
      [
        "current_end",
        "Valor final"
      ],
      [
        "current_delta",
        "Cambio final menos inicial"
      ]
    ]
  },
  {
    "label": "Temperatura",
    "description": "Estad\u00edsticas de las muestras de 0 a 300 segundos. Unidad: \u00b0C",
    "features": [
      [
        "temperature_start",
        "Valor inicial"
      ],
      [
        "temperature_mean",
        "Media aritm\u00e9tica"
      ],
      [
        "temperature_std",
        "Desviaci\u00f3n est\u00e1ndar poblacional"
      ],
      [
        "temperature_min",
        "Valor m\u00ednimo"
      ],
      [
        "temperature_max",
        "Valor m\u00e1ximo"
      ],
      [
        "temperature_end",
        "Valor final"
      ],
      [
        "temperature_delta",
        "Cambio final menos inicial"
      ]
    ]
  },
  {
    "label": "Variables derivadas de telemetr\u00eda",
    "description": "Seleccionadas para la familia de 2 A; la familia de 1 A utiliza las 21 estad\u00edsticas anteriores.",
    "features": [
      [
        "voltage_slope",
        "Pendiente de voltaje"
      ],
      [
        "current_slope",
        "Pendiente de corriente"
      ],
      [
        "temperature_slope",
        "Pendiente de temperatura"
      ],
      [
        "voltage_half_delta",
        "Cambio entre mitades de voltaje"
      ],
      [
        "temperature_half_delta",
        "Cambio entre mitades de temperatura"
      ],
      [
        "power_mean",
        "Potencia media"
      ],
      [
        "power_std",
        "Variabilidad de potencia"
      ],
      [
        "power_delta",
        "Cambio de potencia"
      ],
      [
        "energy_proxy",
        "Integral de voltaje por corriente"
      ]
    ]
  }
];
