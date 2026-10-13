import {
  useState,
} from "react";

import {
  predictBattery,
} from "../services/api";

import type {
  PredictionResponse,
} from "../types/prediction";

import type {
  TelemetryRequest,
} from "../types/telemetry";


const SAMPLE_TELEMETRY: TelemetryRequest = {
  cycle: 25,

  ambient_temperature_c: 4,

  cutoff_voltage_v: 2.2,

  discharge_samples: [
    {
      time_s: 0,
      voltage_v: 4.1,
      current_a: -1.01,
      temperature_c: 4.2,
    },
    {
      time_s: 100,
      voltage_v: 3.95,
      current_a: -1.0,
      temperature_c: 4.6,
    },
    {
      time_s: 200,
      voltage_v: 3.85,
      current_a: -0.99,
      temperature_c: 4.9,
    },
    {
      time_s: 300,
      voltage_v: 3.78,
      current_a: -1.0,
      temperature_c: 5.2,
    },
  ],

  previous_eis: {
    re_ohm: 0.085,
    rct_ohm: 0.15,
  },

  previous_charge: {
    temperature_start_c: 4.1,
    temperature_max_c: 5.4,
    temperature_delta_c: 1.3,
  },
};


export default function PredictionPage() {

  const [
    prediction,
    setPrediction,
  ] = useState<PredictionResponse | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );


  async function handlePrediction() {

    setLoading(true);

    setError(null);

    try {

      const result = await predictBattery(
        SAMPLE_TELEMETRY,
      );

      setPrediction(
        result,
      );

    } catch (error) {

      if (
        error instanceof Error
      ) {

        setError(
          error.message,
        );

      } else {

        setError(
          "Unknown error",
        );
      }

    } finally {

      setLoading(false);
    }
  }


  return (
    <main className="prediction-page">

      <section className="hero">

        <p className="eyebrow">
          EV BATTERY ANALYTICS
        </p>

        <h1>
          Battery Health Predictor
        </h1>

        <p>
          Predicción del Estado de Salud
          de baterías utilizando XGBoost
          y datos de telemetría.
        </p>

      </section>


      <section className="card">

        <h2>
          Probar modelo predictivo
        </h2>

        <p>
          Esta primera versión utiliza una
          telemetría de prueba para verificar
          la comunicación entre React,
          FastAPI y XGBoost.
        </p>

        <button
          onClick={
            handlePrediction
          }
          disabled={
            loading
          }
        >

          {
            loading
              ? "Analizando..."
              : "Ejecutar predicción"
          }

        </button>

      </section>


      {
        error
        &&
        (
          <section className="error-card">

            <strong>
              Error
            </strong>

            <p>
              {error}
            </p>

          </section>
        )
      }


      {
        prediction
        &&
        (
          <section className="results">

            <h2>
              Resultado
            </h2>

            <div className="current-soh">

              <span>
                Estado de salud actual
              </span>

              <strong>
                {
                  prediction
                    .current_soh_percent
                    .toFixed(2)
                }%
              </strong>

              <small>
                SoH
              </small>

            </div>


            <h3>
              Proyección futura
            </h3>


            <div className="prediction-grid">

              {
                prediction
                  .future_predictions
                  .map(
                    (
                      item,
                    ) => (

                      <article
                        key={
                          item.horizon_cycles
                        }
                        className="prediction-card"
                      >

                        <span>
                          +
                          {
                            item.horizon_cycles
                          }
                          {" "}
                          ciclos
                        </span>

                        <strong>

                          {
                            item
                              .predicted_soh_percent
                              .toFixed(2)
                          }%

                        </strong>

                        <small>

                          Ciclo{" "}
                          {
                            item.target_cycle
                          }

                        </small>

                        {
                          item.experimental
                          &&
                          (
                            <em>
                              Experimental
                            </em>
                          )
                        }

                      </article>

                    )
                  )
              }

            </div>

          </section>
        )
      }

    </main>
  );
}