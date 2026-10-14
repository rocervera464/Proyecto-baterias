export interface BatteryUsage {
  state: string;
  range: string;
  uses: string[];
}

// Rangos orientativos de la tabla del proyecto. Los límites inferiores
// pertenecen al rango superior: 90 % es Excelente, 80 % es Bueno, etc.
export function getBatteryUsage(soh: number): BatteryUsage | null {
  if (!Number.isFinite(soh) || soh < 0 || soh > 100) return null;
  if (soh >= 90) return {
    state: "Excelente", range: "90–100 %",
    uses: ["Tracción en vehículo eléctrico", "Aplicaciones de alta potencia", "Uso principal"],
  };
  if (soh >= 80) return {
    state: "Bueno", range: "80–menos de 90 %",
    uses: ["Vehículo eléctrico", "Movilidad eléctrica", "Aplicaciones exigentes"],
  };
  if (soh >= 70) return {
    state: "Degradación moderada", range: "70–menos de 80 %",
    uses: ["Segunda vida: almacenamiento solar", "Almacenamiento residencial", "Respaldo energético"],
  };
  if (soh >= 60) return {
    state: "Degradación alta", range: "60–menos de 70 %",
    uses: ["Aplicaciones estacionarias de menor exigencia", "UPS y respaldo", "Iluminación", "Almacenamiento de baja potencia"],
  };
  if (soh >= 40) return {
    state: "Muy degradada", range: "40–menos de 60 %",
    uses: ["Aplicaciones muy controladas y de baja demanda", "Aprovechamiento de módulos o celdas después de pruebas individuales"],
  };
  return {
    state: "Fin de vida práctico", range: "Menos de 40 %",
    uses: ["Priorizar reciclaje", "Recuperación de materiales", "Descarte especializado"],
  };
}
