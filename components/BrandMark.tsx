"use client";

import Link from "next/link";

/**
 * The way back to the front door (/) — the one navigation element every
 * screen needs and, until now, didn't reliably have: the shelf's old
 * wordmark link vanished when the shelf collapsed, and the ingest screen
 * never had one at all. Two sizes share one mark (the same § the home
 * page's title ornament uses) so it reads as one brand element wherever
 * it shows up.
 */

export function HomeMark({
  collapsed,
  className = "",
}: {
  collapsed?: boolean;
  className?: string;
}) {
  if (collapsed) {
    return (
      <Link
        href="/"
        title="Commonplace — back to the shelf list"
        aria-label="Commonplace — home"
        className={`flex h-8 w-8 items-center justify-center rounded-md font-corpus text-[15px] text-ink-muted transition-colors hover:bg-paper hover:text-ink ${className}`}
      >
        §
      </Link>
    );
  }
  return (
    <Link
      href="/"
      title="Back to the shelf list"
      className={`flex w-fit items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[10px] font-medium tracking-[0.14em] text-ink-muted uppercase transition-colors hover:bg-paper hover:text-ink ${className}`}
    >
      <span aria-hidden="true" className="font-corpus text-[13px] normal-case">
        §
      </span>
      Commonplace
    </Link>
  );
}
