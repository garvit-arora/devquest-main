import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, Flip);
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function revealText(target: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) return gsap.set(target, { opacity: 1, y: 0 });
  return gsap.fromTo(
    target,
    { y: 28, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: 0.08, ...vars },
  );
}

export function revealLines(target: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) return gsap.set(target, { opacity: 1, yPercent: 0 });
  return gsap.fromTo(
    target,
    { yPercent: 105 },
    { yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.12, ...vars },
  );
}

export function staggerCards(target: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) return gsap.set(target, { opacity: 1, y: 0 });
  return gsap.fromTo(
    target,
    { y: 32, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.65, ease: "power2.out", stagger: 0.08, ...vars },
  );
}

export function animateCounter(element: HTMLElement, value: number, suffix = "") {
  const state = { value: 0 };
  return gsap.to(state, {
    value,
    duration: 1.2,
    ease: "power2.out",
    onUpdate: () => {
      element.textContent = `${Math.round(state.value).toLocaleString()}${suffix}`;
    },
  });
}

export function createMagneticButton(element: HTMLElement, strength = 0.22) {
  if (prefersReducedMotion() || window.matchMedia("(pointer: coarse)").matches) return () => {};
  const move = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * strength;
    const y = (event.clientY - rect.top - rect.height / 2) * strength;
    gsap.to(element, { x, y, duration: 0.35, ease: "power3.out" });
  };
  const leave = () => gsap.to(element, { x: 0, y: 0, duration: 0.45, ease: "power3.out" });
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerleave", leave);
  return () => {
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerleave", leave);
  };
}

export function animatePathFlow(path: SVGPathElement, vars: gsap.TweenVars = {}) {
  const length = path.getTotalLength();
  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
  return gsap.to(path, { strokeDashoffset: 0, duration: 1.1, ease: "power2.out", ...vars });
}

export function createPinnedSection(trigger: Element, animation: gsap.core.Animation, end = "+=300%") {
  if (prefersReducedMotion()) return undefined;
  return ScrollTrigger.create({
    trigger,
    start: "top top",
    end,
    pin: true,
    scrub: 0.8,
    animation,
    invalidateOnRefresh: true,
  });
}

export function createHorizontalScroll(trigger: Element, track: Element) {
  if (prefersReducedMotion()) return undefined;
  const distance = () => track.scrollWidth - window.innerWidth;
  return gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger,
      start: "top top",
      end: () => `+=${distance()}`,
      scrub: 0.8,
      pin: true,
      invalidateOnRefresh: true,
    },
  });
}

export function animateTerminal(element: HTMLElement, chunks: string[], delay = 0.45) {
  element.textContent = "";
  const timeline = gsap.timeline();
  chunks.forEach((chunk) => {
    timeline.call(() => {
      element.textContent = `${element.textContent}${chunk}`;
    });
    timeline.to({}, { duration: delay });
  });
  return timeline;
}

export function createCursorSpotlight(element: HTMLElement) {
  if (prefersReducedMotion() || window.matchMedia("(pointer: coarse)").matches) return () => {};
  const move = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    element.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    element.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  };
  element.addEventListener("pointermove", move);
  return () => element.removeEventListener("pointermove", move);
}

export function createParallaxLayer(target: gsap.TweenTarget, amount = 80) {
  if (prefersReducedMotion()) return undefined;
  return gsap.to(target, {
    y: amount,
    ease: "none",
    scrollTrigger: {
      trigger: target as Element,
      start: "top bottom",
      end: "bottom top",
      scrub: true,
    },
  });
}

export function createCreditParticleFlow(target: gsap.TweenTarget, vars: gsap.TweenVars = {}) {
  if (prefersReducedMotion()) return gsap.set(target, { opacity: 1 });
  return gsap.fromTo(
    target,
    { opacity: 0, scale: 0.6, x: -40 },
    { opacity: 1, scale: 1, x: 0, duration: 0.9, ease: "power3.out", stagger: 0.06, ...vars },
  );
}

export { Flip, ScrollTrigger, gsap };
