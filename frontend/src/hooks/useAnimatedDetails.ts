import { useEffect } from "react";

// Delegate to include nested and conditionally rendered native disclosures.
export function useAnimatedDetails() {
  useEffect(() => {
    const running = new Map<HTMLDetailsElement, { animation: Animation; opening: boolean }>();
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const summary = event.target.closest("summary");
      const details = summary?.parentElement;
      if (!(details instanceof HTMLDetailsElement) || event.defaultPrevented) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      event.preventDefault();
      const previous = running.get(details);
      const opening = previous ? !previous.opening : !details.open;
      const start = details.getBoundingClientRect().height;
      previous?.animation.cancel();
      details.style.height = "";
      details.open = true;
      const style = getComputedStyle(details);
      const extra = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const end = opening ? details.getBoundingClientRect().height : summary!.getBoundingClientRect().height + extra;
      details.style.overflow = "hidden";
      const animation = details.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: 260, easing: "cubic-bezier(.2,.7,.3,1)",
      });
      running.set(details, { animation, opening });
      animation.onfinish = () => {
        details.open = opening;
        details.style.overflow = "";
        running.delete(details);
      };
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      running.forEach(({ animation, opening }, details) => {
        animation.cancel();
        details.open = opening;
        details.style.overflow = "";
      });
    };
  }, []);
}
