import Link from "next/link";
import { Logo } from "./Logo";

export function Sidebar({ active }: { active: "recordings" }) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-line-1 bg-black/[0.12] flex flex-col">
      <div className="px-6 pt-6 pb-7 flex items-center gap-2.5">
        <Logo />
        <span className="font-display font-semibold text-lg tracking-tighter">Utter</span>
      </div>
      <nav className="flex flex-col">
        <NavItem href="/" label="Recordings" active={active === "recordings"} />
      </nav>
      <div className="mt-auto px-6 py-5 border-t border-line-1 font-mono text-[10px] uppercase tracking-wider text-text-2">
        <div className="flex justify-between mb-1.5">
          <span>Storage</span><span>2.3 / 50 GB</span>
        </div>
        <div className="h-[3px] bg-bg-2 rounded-sm overflow-hidden">
          <div className="h-full bg-accent" style={{ width: "5%" }} />
        </div>
      </div>
    </aside>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  const cls = active
    ? "text-text-0 border-accent bg-gradient-to-r from-accent/[0.12] to-transparent"
    : "text-text-1 border-transparent hover:text-text-0 hover:bg-white/[0.02]";
  return (
    <Link href={href as any} className={`px-6 py-2 text-[13.5px] border-l-2 ${cls}`}>{label}</Link>
  );
}
