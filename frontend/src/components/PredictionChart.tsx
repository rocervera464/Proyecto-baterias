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

  soh: number;

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
  ];


  return (
    <section className="prediction-chart">

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
              domain={[
                0,
                110,
              ]}
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
                  value,
                ) =>
                  `Ciclo ${value}`
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
              dot={{
                r: 5,
              }}
              activeDot={{
                r: 7,
              }}
              isAnimationActive
            />

          </LineChart>

        </ResponsiveContainer>

      </div>


      <div className="chart-disclaimer">

        <p>
          Cada punto futuro corresponde
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

    </section>
  );
}