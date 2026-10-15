import { useEffect, type RefObject } from "react";

export function useScrollReveal(root: RefObject<HTMLElement | null>, content: unknown) {
  useEffect(() => {
    if (!root.current || !content || typeof IntersectionObserver === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = Array.from(root.current.querySelectorAll<HTMLElement>("[data-reveal]"));
    const showAll = () => elements.forEach((element) => { element.dataset.revealState = "visible"; });
    if (motion.matches) { showAll(); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.revealState = "visible";
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -24px 0px" });
    elements.forEach((element) => { element.dataset.revealState = "pending"; observer.observe(element); });
    const handleMotion = () => { if (motion.matches) { observer.disconnect(); showAll(); } };
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) {
        const element = event.target.closest<HTMLElement>("[data-reveal]");
        if (element) { element.dataset.revealState = "visible"; observer.unobserve(element); }
      }
    };
    const container = root.current;
    container.addEventListener("focusin", handleFocus);
    motion.addEventListener("change", handleMotion);
    return () => {
      observer.disconnect(); showAll();
      container.removeEventListener("focusin", handleFocus);
      motion.removeEventListener("change", handleMotion);
    };
  }, [root, content]);
}
