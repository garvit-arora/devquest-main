"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function DevQuestLoader({ className, fullScreen = false }: { className?: string; fullScreen?: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paths = gsap.utils.toArray<SVGPathElement>(svg.querySelectorAll("path"));

    paths.forEach((path) => {
      const length = path.getTotalLength();
      gsap.set(path, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });
    });

    const timeline = gsap
      .timeline({
        repeat: -1,
        defaults: { duration: 3, ease: "power1.inOut" },
      })
      .set(svg, { opacity: 1 })
      .to(paths, { strokeDashoffset: 0 }, 0)
      .to(paths, { strokeDashoffset: (index) => -paths[index].getTotalLength() }, 3);

    return () => {
      timeline.kill();
    };
  }, []);

  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden bg-[#0e100f]",
        fullScreen ? "fixed inset-0 z-[9998] h-screen w-screen" : "min-h-[calc(100vh-48px)] w-full",
        className,
      )}
      aria-label="Loading"
      role="status"
    >
      <div className="relative grid size-[min(36vw,132px)] min-h-24 min-w-24 place-items-center rounded-[9px] sm:size-[150px] md:size-[164px]">
        <svg
          ref={svgRef}
          id="svg-stage"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          fill="none"
          opacity="0"
          className="h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="brain-gradient" x1="70" y1="40" x2="460" y2="470" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fffce1" />
              <stop offset="52%" stopColor="#dfdcff" />
              <stop offset="100%" stopColor="#a69eff" />
            </linearGradient>
          </defs>
          <path d="M250 53 C211 53 183 82 183 119 C183 125 184 131 186 137 C174 130 161 127 147 127 C111 127 82 156 82 192 C82 202 84 211 88 220 C62 232 45 258 45 287 C45 318 64 345 92 356 C85 368 82 382 82 397 C82 433 111 462 147 462 C162 462 176 457 187 448 C195 473 219 491 247 491 C282 491 310 463 310 428 L310 119 C310 82 282 53 250 53 Z" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M310 119 L310 428" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M186 137 C206 146 218 163 218 184 C218 208 201 227 178 232" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M88 220 C108 231 130 233 151 226" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M222 173 C248 170 268 187 270 211 C272 232 259 250 239 258" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M310 255 C280 255 260 240 254 218" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M93 356 C113 346 137 346 157 358" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M181 291 C204 301 216 323 211 346 C207 368 190 384 168 388" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M205 365 C215 395 240 412 270 410" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M310 135 H350 C365 135 375 125 375 110 V88" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M375 58 A30 30 0 1 1 374.9 58 Z" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M310 204 H405 C420 204 430 194 430 179 V166" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M430 136 A30 30 0 1 1 429.9 136 Z" stroke="url(#brain-gradient)" strokeWidth="15" />
          <path d="M310 276 H401" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" />
          <path d="M431 276 A30 30 0 1 1 430.9 276 Z" stroke="url(#brain-gradient)" strokeWidth="15" />
          <path d="M310 347 H405 C420 347 430 357 430 372 V384" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M430 414 A30 30 0 1 1 429.9 414 Z" stroke="url(#brain-gradient)" strokeWidth="15" />
          <path d="M310 407 H342 C357 407 367 417 367 432 V438" stroke="url(#brain-gradient)" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M367 468 A30 30 0 1 1 366.9 468 Z" stroke="url(#brain-gradient)" strokeWidth="15" />
        </svg>
      </div>
    </div>
  );
}
