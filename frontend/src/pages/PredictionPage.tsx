import {
  useState,
} from "react";

import PredictionChart
  from "../components/PredictionChart";

import TelemetryForm
  from "../components/TelemetryForm";

import {
  predictBattery,
} from "../services/api";

import type {
  PredictionResponse,
} from "../types/prediction";

import type {
  TelemetryRequest,
} from "../types/telemetry";


export default function PredictionPage() {

  // ==========================================================
  // ESTADO DE LA PREDICCIÓN
  // ==========================================================

  const [
    prediction,
    setPrediction,
  ] = useState<
    PredictionResponse | null
  >(
    null,
  );


  // ==========================================================
  // ESTADO DE CARGA
  // ==========================================================

  const [
    loading,
    setLoading,
  ] = useState(
    false,
  );


  // ==========================================================
  // ESTADO DE ERROR
  // ==========================================================

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(
    null,
  );


  // ==========================================================
  // EJECUTAR PREDICCIÓN
  // ==========================================================

  async function handlePrediction(
    telemetry: TelemetryRequest,
  ) {

    setLoading(
      true,
    );

    setError(
      null,
    );

    setPrediction(
      null,
    );


    try {

      const result =
        await predictBattery(
          telemetry,
        );


      setPrediction(
        result,
      );

    } catch (
      error
    ) {

      if (
        error instanceof Error
      ) {

        setError(
          error.message,
        );

      } else {

        setError(
          "Ocurrió un error inesperado.",
        );
      }

    } finally {

      setLoading(
        false,
      );
    }
  }


  // ==========================================================
  // INTERFAZ
  // ==========================================================

  return (
    <div className="prediction-content">




      {/* =====================================================
          FORMULARIO
      ===================================================== */}

      <section className="card">

        <TelemetryForm
          onSubmit={
            handlePrediction
          }
          loading={
            loading
          }
        />

      </section>


      {/* =====================================================
          ERROR
      ===================================================== */}

      {
        error
        &&
        (
          <section className="error-card">

            <strong>
              No fue posible realizar
              la predicción
            </strong>


            <p>
              {error}
            </p>

          </section>
        )
      }


      {/* =====================================================
          RESULTADOS
      ===================================================== */}

      {
        prediction
        &&
        (
          <section className="results">

            <h2>
              Resultado
            </h2>


            {/* ===============================================
                SOH ACTUAL
            =============================================== */}

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


            {/* ===============================================
                PREDICCIONES FUTURAS
            =============================================== */}

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
                          item
                            .horizon_cycles
                        }
                        className="prediction-card"
                      >

                        <span>

                          +

                          {
                            item
                              .horizon_cycles
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
                            item
                              .target_cycle
                          }

                        </small>


                        {
                          item
                            .experimental
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


            {/* ===============================================
                GRÁFICA
            =============================================== */}

            <PredictionChart
              prediction={
                prediction
              }
            />

          </section>
        )
      }

    </div>
  );
}