"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function ShapeTransitionLink({ href, className, children, external = false }: { href: string; className?: string; children: ReactNode; external?: boolean }) {
  if (external || href.startsWith("http")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
