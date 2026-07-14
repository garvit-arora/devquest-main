"use client";

import gsap from "gsap";
import { TextPlugin } from "gsap/TextPlugin";
import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(TextPlugin);

type AnimatedMoriButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  workingLabel?: string;
  doneLabel?: string;
  icon?: ReactNode;
};

export function AnimatedMoriButton({
  label,
  workingLabel = "Sending...",
  doneLabel = "Sent!",
  icon,
  className,
  disabled,
  onPointerUp,
  ...props
}: AnimatedMoriButtonProps) {
  const textRef = useRef<HTMLSpanElement | null>(null);

  function animate(event: PointerEvent<HTMLButtonElement>) {
    onPointerUp?.(event);
    if (disabled || event.defaultPrevented || !textRef.current) return;

    gsap
      .timeline()
      .to(textRef.current, {
        duration: 0.45,
        text: { value: workingLabel, type: "diff" },
        ease: "sine.in",
      })
      .to(textRef.current, {
        duration: 0.4,
        text: { value: workingLabel.replace(/\.+$/, ""), type: "diff" },
        ease: "sine.inOut",
        repeat: 2,
        yoyo: true,
      })
      .to(textRef.current, { duration: 0.2, text: doneLabel, ease: "none" }, "+=0.15")
      .to(textRef.current, { duration: 0.25, text: label, ease: "sine.out" }, "+=0.65");
  }

  return (
    <button {...props} disabled={disabled} onPointerUp={animate} className={cn("mori-button inline-flex items-center justify-center gap-2", className)}>
      {icon}
      <span ref={textRef}>{label}</span>
    </button>
  );
}
