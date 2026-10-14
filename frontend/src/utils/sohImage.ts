export interface SohImage {
  src: string;
  alt: string;
}

export function getSohImage(soh: unknown): SohImage | null {
  if (typeof soh !== "number" || !Number.isFinite(soh) || soh < 0 || soh > 100) {
    return null;
  }
  if (soh >= 90) return {
    src: "/images/soh_1_excelente.jpg",
    alt: "Ilustración asociada al estado Excelente de la batería, SoH de 90 a 100 %",
  };
  if (soh >= 80) return {
    src: "/images/soh_2_bueno.jpg",
    alt: "Furgoneta eléctrica y vehículos de movilidad urbana con batería en estado Bueno, SoH de 80 a menos de 90 %",
  };
  if (soh >= 70) return {
    src: "/images/soh_3_moderada.jpg",
    alt: "Ilustración asociada a degradación moderada de la batería, SoH de 70 a menos de 80 %",
  };
  if (soh >= 60) return {
    src: "/images/soh_4_alta.jpg",
    alt: "Ilustración asociada a degradación alta de la batería, SoH de 60 a menos de 70 %",
  };
  if (soh >= 40) return {
    src: "/images/soh_5_muy_degradada.jpg",
    alt: "Ilustración asociada a una batería muy degradada, SoH de 40 a menos de 60 %",
  };
  return {
    src: "/images/soh_6_fin_vida.jpg",
    alt: "Ilustración asociada al fin de vida práctico de la batería, SoH inferior a 40 %",
  };
}

export function getSohImages(soh: unknown): SohImage[] {
  const image = getSohImage(soh);
  if (!image) return [];
  if (typeof soh === "number" && soh >= 80 && soh < 90) {
    return [image, {
      src: "/images/soh_2_bueno_almacenamiento.jpg",
      alt: "Baterías en un garaje con paneles solares y SoH de 80 a menos de 90 %",
    }];
  }
  return [image];
}
