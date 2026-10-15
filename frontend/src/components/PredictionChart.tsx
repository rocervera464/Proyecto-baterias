import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  PredictionResponse,
} from "../types/prediction";


interface PredictionChartProps {
  prediction: PredictionResponse;
}


interface ChartPoint {
  cycle: number;

  soh: number | null;

  horizon: number;

  experimental: boolean;

  label: string;
}


export default function PredictionChart({
  prediction,
}: PredictionChartProps) {

  const chartData: ChartPoint[] = [
    {
      cycle:
        prediction.current_cycle,

      soh:
        prediction.current_soh_percent,

      horizon:
        0,

      experimental:
        false,

      label:
        "Actual",
    },

    ...prediction.future_predictions.map(
      (
        item,
      ): ChartPoint => ({
        cycle:
          item.target_cycle,

        soh:
          item.predicted_soh_percent,

        horizon:
          item.horizon_cycles,

        experimental:
          item.experimental,

        label:
          `+${item.horizon_cycles}`,
      }),
    ),
  ].map((point) => ({ ...point, soh: Number.isFinite(point.soh) ? point.soh : null }));
  const finiteValues = chartData.flatMap((point) => point.soh === null ? [] : [point.soh]);
  const yDomain = [Math.min(0, Math.floor(Math.min(...finiteValues, 0) / 10) * 10), Math.max(110, Math.ceil(Math.max(...finiteValues, 100) / 10) * 10)];


  return (
    <section data-reveal className="prediction-chart">

      <div className="chart-header">

        <div>

          <p className="section-kicker">
            PROYECCIÓN
          </p>

          <h3>
            Evolución estimada del SoH
          </h3>

        </div>

        <span className="chart-note">
          Horizonte en ciclos
        </span>

      </div>


      <div className="chart-container">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <LineChart
            data={
              chartData
            }
            margin={{
              top: 20,
              right: 25,
              left: 0,
              bottom: 10,
            }}
          >

            <CartesianGrid
              strokeDasharray="4 4"
              vertical={false}
            />


            <XAxis
              dataKey="cycle"
              type="number"
              domain={[
                "dataMin",
                "dataMax",
              ]}
              allowDecimals={false}
              label={{
                value: "Ciclo",
                position:
                  "insideBottom",
                offset:
                  -5,
              }}
            />


            <YAxis
              domain={yDomain}
              tickFormatter={
                (
                  value,
                ) =>
                  `${value}%`
              }
              label={{
                value: "SoH",
                angle: -90,
                position:
                  "insideLeft",
              }}
            />


            <Tooltip
              formatter={
                (
                  value,
                ) => [
                  `${
                    Number(
                      value,
                    ).toFixed(
                      2,
                    )
                  }%`,
                  "SoH",
                ]
              }
              labelFormatter={
                (
                  value, payload,
                ) =>
                  `Ciclo ${value} · ${payload?.[0]?.payload?.label ?? ""}${payload?.[0]?.payload?.experimental ? " · Experimental" : ""}`
              }
            />


            <Legend />


            <ReferenceLine
              y={80}
              strokeDasharray="6 6"
              label={{
                value:
                  "Referencia 80%",
                position:
                  "insideTopRight",
              }}
            />


            <Line
              type="linear"
              dataKey="soh"
              name="SoH estimado"
              strokeWidth={3}
              stroke="#178B78"
              strokeDasharray="5 6"
              dot={{
                r: 5,
              }}
              activeDot={{
                r: 7,
              }}
              isAnimationActive={false}
            />

          </LineChart>

        </ResponsiveContainer>

      </div>


      <div className="chart-disclaimer">

        <p>
          Las conexiones discontinuas son ayudas visuales, no una curva física continua. Cada punto futuro corresponde
          a un modelo XGBoost entrenado
          para un horizonte específico.
        </p>

        <p>
          La línea del 80% es únicamente
          una referencia visual y todavía
          no representa una estimación
          formal de RUL o End of Life.
        </p>

      </div>

      <details className="chart-table">
        <summary>Consultar los valores de la gráfica</summary>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Valores de las predicciones">
          <table><caption className="sr-only">SoH por ciclo y horizonte de predicción</caption><thead><tr><th scope="col">Ciclo</th><th scope="col">Horizonte</th><th scope="col">SoH</th><th scope="col">Tipo</th></tr></thead>
          <tbody>{chartData.map((point) => <tr key={point.horizon}><td>{point.cycle}</td><td>{point.label}</td><td>{point.soh === null ? "No disponible" : `${point.soh.toFixed(2)} %`}</td><td>{point.experimental ? "Experimental" : point.horizon === 0 ? "Actual" : "Principal"}</td></tr>)}</tbody></table>
        </div>
      </details>

    </section>
  );
}
