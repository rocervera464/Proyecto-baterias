import {
  useState,
} from "react";

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

  const [
    prediction,
    setPrediction,
  ] = useState<
    PredictionResponse | null
  >(
    null,
  );


  const [
    loading,
    setLoading,
  ] = useState(
    false,
  );


  const [
    error,
    setError,
  ] = useState<
    string | null
  >(
    null,
  );


  async function handlePrediction(
    telemetry:
      TelemetryRequest,
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


  return (
    <main className="prediction-page">

      <header className="hero">

        <h1>
          Predictor del estado de salud de baterías
        </h1>

        <p>
          Carga la telemetría de una
          descarga para estimar el
          Estado de Salud actual y su
          evolución futura mediante
          XGBoost.
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

          </section>
        )
      }

    </main>
  );
}
