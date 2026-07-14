"use client";

import gsap from "gsap";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const numPoints = 10;
const delayPointsMax = 0.3;
const delayPerPath = 0.22;

function isDashboardRoute(path: string) {
  return path === "/app" || path.startsWith("/app/") || path === "/admin" || path.startsWith("/admin/");
}

function buildPath(points: number[], opened: boolean) {
  let d = opened ? `M 0 0 V ${points[0]} C` : `M 0 ${points[0]} C`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p = ((index + 1) / (points.length - 1)) * 100;
    const cp = p - (1 / (points.length - 1) * 100) / 2;
    d += ` ${cp} ${points[index]} ${cp} ${points[index + 1]} ${p} ${points[index + 1]}`;
  }

  d += opened ? " V 100 H 0" : " V 0 H 0";
  return d;
}

export function MorphRouteTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const pathsRef = useRef<SVGPathElement[]>([]);
  const isAnimatingRef = useRef(false);
  const shouldRevealRef = useRef(false);

  function setPath(index: number, path: SVGPathElement | null) {
    if (path) pathsRef.current[index] = path;
  }

  function render(allPoints: number[][], opened: boolean) {
    pathsRef.current.forEach((path, index) => {
      const points = allPoints[index];
      if (!points) return;
      path.setAttribute("d", buildPath(points, opened));
    });
  }

  function animateCover(onComplete: () => void) {
    const pointsDelay = Array.from({ length: numPoints }, () => Math.random() * delayPointsMax);
    const allPoints = pathsRef.current.map(() => Array.from({ length: numPoints }, () => 100));

    isAnimatingRef.current = true;
    gsap.set(overlayRef.current, { pointerEvents: "auto" });

    const timeline = gsap.timeline({
      defaults: { ease: "power2.inOut", duration: 0.9 },
      onUpdate: () => render(allPoints, true),
      onComplete: () => {
        isAnimatingRef.current = false;
        onComplete();
      },
    });

    allPoints.forEach((points, pathIndex) => {
      const pathDelay = delayPerPath * pathIndex;
      points.forEach((_, pointIndex) => {
        timeline.to(points, { [pointIndex]: 0 }, pointsDelay[pointIndex] + pathDelay);
      });
    });
  }

  function animateReveal() {
    const pointsDelay = Array.from({ length: numPoints }, () => Math.random() * delayPointsMax);
    const allPoints = pathsRef.current.map(() => Array.from({ length: numPoints }, () => 0));

    isAnimatingRef.current = true;
    gsap.set(overlayRef.current, { pointerEvents: "auto" });
    render(allPoints, true);

    const timeline = gsap.timeline({
      defaults: { ease: "power2.inOut", duration: 0.9 },
      onUpdate: () => render(allPoints, true),
      onComplete: () => {
        isAnimatingRef.current = false;
        gsap.set(overlayRef.current, { pointerEvents: "none" });
        pathsRef.current.forEach((path) => path.setAttribute("d", ""));
      },
    });

    allPoints.forEach((points, pathIndex) => {
      const pathDelay = delayPerPath * (allPoints.length - pathIndex - 1);
      points.forEach((_, pointIndex) => {
        timeline.to(points, { [pointIndex]: 100 }, pointsDelay[pointIndex] + pathDelay);
      });
    });
  }

  useEffect(() => {
    if (isDashboardRoute(pathname)) {
      shouldRevealRef.current = false;
      window.sessionStorage.removeItem("devquest_transition_in");
      gsap.set(overlayRef.current, { pointerEvents: "none" });
      pathsRef.current.forEach((path) => path.setAttribute("d", ""));
      return;
    }
    if (!shouldRevealRef.current && window.sessionStorage.getItem("devquest_transition_in") !== "1") return;
    shouldRevealRef.current = false;
    window.sessionStorage.removeItem("devquest_transition_in");
    animateReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (isAnimatingRef.current) {
        event.preventDefault();
        return;
      }

      const destination = new URL(href, window.location.href);
      if (destination.href === window.location.href) return;
      if (isDashboardRoute(pathname) || (destination.origin === window.location.origin && isDashboardRoute(destination.pathname))) return;

      event.preventDefault();
      animateCover(() => {
        window.sessionStorage.setItem("devquest_transition_in", "1");
        if (destination.origin === window.location.origin) {
          shouldRevealRef.current = true;
          router.push(`${destination.pathname}${destination.search}${destination.hash}`);
        } else {
          window.location.href = destination.href;
        }
      });
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <svg
      ref={overlayRef}
      className="pointer-events-none fixed inset-0 z-[9999] h-full w-full cursor-pointer"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="devquest-morph-gradient-1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0e100f" />
          <stop offset="48%" stopColor="#2a243a" />
          <stop offset="100%" stopColor="#a69eff" />
        </linearGradient>
        <linearGradient id="devquest-morph-gradient-2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fffce1" />
          <stop offset="52%" stopColor="#dfdcff" />
          <stop offset="100%" stopColor="#6f66ff" />
        </linearGradient>
      </defs>
      <path ref={(path) => setPath(0, path)} fill="url(#devquest-morph-gradient-2)" />
      <path ref={(path) => setPath(1, path)} fill="url(#devquest-morph-gradient-1)" />
    </svg>
  );
}
