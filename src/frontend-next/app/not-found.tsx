import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

const sections = [
  { href: "/overview", label: "Overview" },
  { href: "/assets", label: "Assets" },
  { href: "/risk-areas", label: "Risk & Areas" },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/crews", label: "Crews" },
  { href: "/grid-map", label: "Grid Map" },
  { href: "/simulation", label: "Simulation" },
];

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto mt-10 bg-panel border border-line rounded-xl p-9 shadow-panel">
      <p className="font-mono text-label font-semibold tracking-[0.1em] text-brand mb-2.5">
        ERROR 404 · RESOURCE NOT FOUND
      </p>
      <h1 className="text-title leading-tight font-semibold tracking-tight mb-3">
        That page isn&rsquo;t part of the console.
      </h1>
      <p className="text-lede leading-relaxed text-ink-2 mb-7">
        The address you requested doesn&rsquo;t match any view in the Grid Risk Command
        Center. It may have been mistyped, or you may have followed an out-of-date link.
      </p>

      <Link
        href="/overview"
        className="inline-flex items-center h-10 px-[18px] rounded-lg bg-brand-ink text-white text-sm font-semibold no-underline hover:bg-brand transition-colors"
      >
        Return to the console
      </Link>

      <nav aria-label="Console sections" className="mt-7 pt-5 border-t border-line text-label text-ink-2">
        Jump straight to a section:
        <ul className="mt-2.5 flex flex-wrap gap-x-[18px] gap-y-2 p-0 list-none">
          {sections.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="text-brand font-medium no-underline hover:underline">
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
