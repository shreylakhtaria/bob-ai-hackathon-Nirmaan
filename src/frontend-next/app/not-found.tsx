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
  { href: "/copilot", label: "Copilot" },
];

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto mt-10 bg-white border border-[#c0c9c0] rounded-xl p-9 shadow-sm">
      <p className="font-mono text-[13px] font-semibold tracking-[0.1em] text-[#0f5132] mb-2.5">
        ERROR 404 · RESOURCE NOT FOUND
      </p>
      <h1 className="text-[27px] leading-tight font-semibold tracking-tight mb-3">
        That page isn&rsquo;t part of the console.
      </h1>
      <p className="text-[15px] leading-relaxed text-[#404942] mb-7">
        The address you requested doesn&rsquo;t match any view in the Grid Risk Command
        Center. It may have been mistyped, or you may have followed an out-of-date link.
      </p>

      <Link
        href="/overview"
        className="inline-flex items-center h-10 px-[18px] rounded-lg bg-[#003820] text-white text-sm font-semibold no-underline hover:bg-[#0f5132] transition-colors"
      >
        Return to the console
      </Link>

      <nav aria-label="Console sections" className="mt-7 pt-5 border-t border-[#c0c9c0] text-[13px] text-[#404942]">
        Jump straight to a section:
        <ul className="mt-2.5 flex flex-wrap gap-x-[18px] gap-y-2 p-0 list-none">
          {sections.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="text-[#0f5132] font-medium no-underline hover:underline">
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
