import { useId, useLayoutEffect, useRef, useState } from "react";
import type { BatteryUse } from "../data/batterySecondLifeData";
import BatteryUseAccordion from "./BatteryUseAccordion";

export default function BatteryUseCarousel({ applications }: { applications: BatteryUse[] }) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    const element = track.current;
    const slide = element?.children[active] as HTMLElement | undefined;
    if (!element || !slide) return;
    // Only the visible slide determines the viewport height. Other slides may
    // retain expanded details without leaving empty space under this one.
    const resize = () => {
      const scrollbar = element.offsetHeight - element.clientHeight;
      const padding = parseFloat(getComputedStyle(element).paddingBottom) || 0;
      element.style.height = `${slide.getBoundingClientRect().height + padding + scrollbar}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(slide);
    return () => observer.disconnect();
  }, [active, applications]);
  const goTo = (index: number) => {
    const element = track.current;
    const slide = element?.children[index] as HTMLElement | undefined;
    if (!element || !slide) return;
    element.scrollTo({ left: slide.offsetLeft - (element.children[0] as HTMLElement).offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  if (!applications.length) return null;
  return <section className="use-carousel" aria-label="Aplicaciones por prioridad orientativa" aria-roledescription="carrusel">
    <div className="use-carousel-toolbar">
      <div><span className="section-kicker">OPCIONES PARA ESTE ESTADO DE SALUD</span><h4>Mejores opciones de uso para tu batería</h4><p>Orden orientativo según el SoH. Abre cada opción para consultar sus requisitos.</p></div>
      <div className="use-carousel-controls">
        <button type="button" aria-label="Aplicación anterior" aria-controls={id} disabled={active === 0} onClick={() => goTo(active - 1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg></button>
        <span aria-live="polite" aria-atomic="true">{active + 1} / {applications.length}</span>
        <button type="button" aria-label="Siguiente aplicación" aria-controls={id} disabled={active === applications.length - 1} onClick={() => goTo(active + 1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg></button>
      </div>
    </div>
    <div className="use-carousel-track" id={id} ref={track} tabIndex={0}
      aria-label="Desliza para explorar las aplicaciones"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(Math.max(0, Math.min(applications.length - 1, active + (event.key === "ArrowRight" ? 1 : -1))));
        }
      }}
      onScroll={() => {
        const element = track.current;
        if (!element) return;
        const first = (element.children[0] as HTMLElement).offsetLeft;
        let closest = 0;
        Array.from(element.children).forEach((child, index) => {
          if (Math.abs((child as HTMLElement).offsetLeft - first - element.scrollLeft) < Math.abs((element.children[closest] as HTMLElement).offsetLeft - first - element.scrollLeft)) closest = index;
        });
        setActive(closest);
      }}>
      {applications.map((application, index) => <div key={application.id} className="use-carousel-slide" role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${applications.length}: ${application.title}`}>
        <div className="use-slide-priority"><span>{String(index + 1).padStart(2, "0")}</span><strong>{index === 0 ? "Primera opción para evaluar" : "Alternativa para evaluar"}</strong></div>
        <BatteryUseAccordion application={application} />
      </div>)}
    </div>
    <div className="use-carousel-pagination" aria-label="Elegir aplicación">
      {applications.map((application, index) => <button type="button" key={application.id} aria-label={`Ver ${application.title}`} aria-current={active === index ? "true" : undefined} onClick={() => goTo(index)}><span /></button>)}
    </div>
  </section>;
}
