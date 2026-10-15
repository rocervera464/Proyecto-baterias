export interface SohImage {
  src: string;
  alt: string;
}

export function getSohImage(soh: unknown): SohImage | null {
  if (typeof soh !== "number" || !Number.isFinite(soh) || soh < 0 || soh > 100) {
    return null;
  }
  if (soh >= 90) return {
    src: "/images/soh-90-100.jpg",
    alt: "Técnico evaluando una batería de vehículo eléctrico en un taller; imagen del rango de 90 a 100 % de SoH",
  };
  if (soh >= 80) return {
    src: "/images/soh-80-90.jpg",
    alt: "Vivienda con paneles solares y almacenamiento residencial; imagen del rango de 80 a menos de 90 % de SoH",
  };
  if (soh >= 70) return {
    src: "/images/soh-70-80.jpg",
    alt: "Módulos de baterías integrados en almacenamiento estacionario junto a generación solar; rango de 70 a menos de 80 % de SoH",
  };
  if (soh >= 60) return {
    src: "/images/soh-60-70.jpg",
    alt: "Cabaña con paneles solares y una unidad de almacenamiento; imagen del rango de 60 a menos de 70 % de SoH",
  };
  return {
    src: "/images/soh-under-60.jpg",
    alt: "Personal especializado trabajando con módulos de baterías en una instalación industrial; imagen para SoH inferior al 60 %",
  };
}

export function getSohImages(soh: unknown): SohImage[] {
  const image = getSohImage(soh);
  if (!image) return [];
  return [image];
}
