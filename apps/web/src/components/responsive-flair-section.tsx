"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

const flairUrl = "https://assets.codepen.io/16327/scroll-flair-2.png";

export function ResponsiveFlairSection() {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();
    const select = gsap.utils.selector(root);

    mm.add(
      {
        isSmall: "(max-width: 800px)",
        isLarge: "(min-width: 801px)",
      },
      (context) => {
        const small = select(".responsive-flair-small");
        const large = select(".responsive-flair-large");
        const boxes = select(".responsive-flair-box");

        gsap.set(boxes, { opacity: 1, display: "flex", scale: 1 });
        gsap.set(select(".responsive-flair-box img"), { clearProps: "rotation" });

        if (context.conditions?.isSmall) {
          gsap.set(large, { display: "none" });
          gsap.from(small, { scale: 0, ease: "back.out(1.8)", duration: 0.8 });
          return gsap.to(select(".responsive-flair-small img"), { rotation: 360, repeat: -1, ease: "none", duration: 1.1 });
        }

        gsap.set(small, { display: "none" });
        gsap.from(large, { scale: 0, ease: "back.out(1.8)", duration: 0.8 });
        return gsap.to(select(".responsive-flair-large img"), { rotation: -360, repeat: -1, ease: "none", duration: 1.1 });
      },
    );

    return () => {
      mm.revert();
    };
  }, []);

  return (
    <section ref={rootRef} className="relative z-10 flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0e100f] px-5 py-16 text-center text-[#fffce1]">
      <div className="max-w-4xl">
        <p className="font-mori text-xs font-semibold uppercase tracking-[0.24em] text-[#fffce1]/58">Responsive by default</p>
        <h2 className="responsive-braces mt-5 font-podium text-[clamp(3.4rem,10vw,9rem)] font-bold uppercase leading-none">
          Any Screen
        </h2>
        <p className="mx-auto mt-6 max-w-2xl font-mori text-base leading-7 text-[#fffce1]/70 sm:text-lg">
          DevQuest keeps the dashboard, automations canvas, docs, and API tools crisp across phones, tablets, and full workstations.
        </p>
      </div>

      <div className="responsive-flair-box responsive-flair-small mt-10 aspect-[9/16] w-[min(58vw,220px)] items-center justify-center rounded-[10px] bg-[#fffce1] opacity-0 shadow-[0_28px_80px_rgba(247,189,248,0.16)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={flairUrl} alt="" className="w-1/3" />
      </div>

      <div className="responsive-flair-box responsive-flair-large mt-10 aspect-video w-[min(66vw,760px)] items-center justify-center rounded-[10px] bg-[#fffce1] opacity-0 shadow-[0_34px_100px_rgba(166,158,255,0.18)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={flairUrl} alt="" className="w-1/3" />
      </div>
    </section>
  );
}
