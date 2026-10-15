type IconName = "battery" | "clock" | "layers" | "chart" | "solar" | "shield" | "grid";
const paths: Record<IconName, string> = {
  battery: "M3 7h16v10H3z M22 10v4 M7 10v4 M11 10v4 M15 10v4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  layers: "m12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  chart: "M4 3v17h17 M7 14l4-5 4 3 5-7",
  solar: "M12 3v2 M4 5l2 2 M20 5l-2 2 M3 11h2 M19 11h2 M9 11a3 3 0 0 1 6 0 M5 16h14l2 5H3z M12 16v5",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z m-4 9 3 3 5-6",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
};
export default function Icon({ name }: { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
