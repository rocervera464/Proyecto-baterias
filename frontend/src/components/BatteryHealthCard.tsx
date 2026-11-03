import { useEffect, useRef } from "react";
import { getBatteryUsage } from "../utils/batteryUsage";
import "./batteryHealthCard.css";

export default function BatteryHealthCard({ soh, cycle }: { soh: number; cycle: number | null }) {
  const batteryRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const battery = batteryRef.current;
    const level = levelRef.current;
    if (!battery || !level) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let animation: Animation | undefined;
    const replay = () => {
      animation?.cancel();
      level.style.transform = "scaleX(1)";
      if (!motion.matches) {
        animation = level.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: 1100, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both",
        });
      }
    };
    const onMotionChange = () => {
      animation?.cancel();
      level.style.transform = "scaleX(1)";
    };
    motion.addEventListener("change", onMotionChange);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio >= 0.35 && !visible) {
        visible = true;
        replay();
      } else if (!entry.isIntersecting) {
        visible = false;
        animation?.cancel();
        level.style.transform = motion.matches ? "scaleX(1)" : "scaleX(0)";
      }
    }, { threshold: [0, 0.35], rootMargin: "-100px 0px 0px 0px" });
    if (!motion.matches) level.style.transform = "scaleX(0)";
    observer.observe(battery);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", onMotionChange);
      animation?.cancel();
      level.style.transform = "";
    };
  }, [soh]);
  const valid = Number.isFinite(soh) && soh >= 0 && soh <= 120;
  const usage = getBatteryUsage(soh);
  const tone = !valid ? "neutral" : soh >= 80 ? "good" : soh >= 60 ? "caution" : "low";
  return <article data-reveal className="health-card battery-health-card" data-tone={tone} aria-label="Estado de salud actual de la batería">
    <div className="battery-health-heading"><div><span className="battery-health-kicker">DIAGNÓSTICO DE LA BATERÍA</span><h3>Estado de salud actual</h3></div><span className="battery-cycle">{cycle == null ? "Telemetría temprana" : `Ciclo ${cycle}`}</span></div>
    <div className="battery-health-display">
      <div className="health-battery" ref={batteryRef} aria-hidden="true">
        <div className="health-battery-body">
          <div className="health-battery-interior"><div className="health-battery-level" ref={levelRef} style={{ width: `${valid ? soh : 0}%` }} /></div>
          <div className="health-battery-divisions" />
          <svg className="health-battery-pulse" viewBox="0 0 100 64" fill="none"><path d="M8 34h21l12-21 16 39 13-23h22" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="health-battery-terminal" />
      </div>
      <div className="battery-health-reading"><span>Salud estimada · SoH</span><strong>{Number.isFinite(soh) ? soh.toFixed(2) : "—"}<small>{Number.isFinite(soh) ? "%" : ""}</small></strong><span className="battery-health-status"><i aria-hidden="true" />{usage?.state ?? (soh > 100 && valid ? "Sobre la referencia inicial" : "Fuera del intervalo orientativo")}</span></div>
    </div>
    <div className="battery-health-scale" aria-hidden="true"><span>0 %</span><span>Capacidad relativa estimada</span><span>100 %</span></div>
    {!valid && <p>Valor fuera de 0–120 %. No se representa un nivel en la batería.</p>}
    {valid && soh > 100 && <p>La capacidad relativa puede superar el 100 % respecto de la mediana inicial. El valor se muestra tal como lo entrega el modelo.</p>}
    <p className="battery-health-note">El nivel representa el estado de salud (SoH), no la carga disponible (SoC). No es un porcentaje de seguridad.</p>
  </article>;
}
