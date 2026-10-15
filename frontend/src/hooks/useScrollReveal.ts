import { useEffect, type RefObject } from "react";

export function useScrollReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = new Set<HTMLElement>();
    const showAll = () => elements.forEach((element) => { element.dataset.revealState = "visible"; });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.revealState = "visible";
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -20px 0px" });
    const register = (node: Element) => {
      const candidates = [...(node.matches("[data-reveal]") ? [node] : []), ...node.querySelectorAll("[data-reveal]")];
      candidates.forEach((candidate) => {
        if (!(candidate instanceof HTMLElement) || elements.has(candidate)) return;
        elements.add(candidate);
        if (motion.matches) candidate.dataset.revealState = "visible";
        else { candidate.dataset.revealState = "pending"; observer.observe(candidate); }
      });
    };
    register(root.current);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => { if (node instanceof Element) register(node); }));
      elements.forEach((element) => {
        if (!root.current?.contains(element)) { observer.unobserve(element); elements.delete(element); }
      });
    });
    mutations.observe(root.current, { childList: true, subtree: true });
    const handleMotion = () => { if (motion.matches) { observer.disconnect(); showAll(); } };
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) {
        elements.forEach((element) => {
          if (element.contains(event.target as Node)) { element.dataset.revealState = "visible"; observer.unobserve(element); }
        });
      }
    };
    const container = root.current;
    container.addEventListener("focusin", handleFocus);
    motion.addEventListener("change", handleMotion);
    return () => {
      mutations.disconnect(); observer.disconnect(); showAll(); elements.clear();
      container.removeEventListener("focusin", handleFocus);
      motion.removeEventListener("change", handleMotion);
    };
  }, [root]);
}
