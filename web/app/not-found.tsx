import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="text-center">
        <div className="flex justify-center mb-4"><Logo size={32} /></div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-2 mb-3">404 · Not found</p>
        <h1 className="font-display text-4xl font-semibold tracking-tighter mb-3">Nothing here.</h1>
        <p className="text-text-1 mb-6">The recording you're looking for doesn't exist or was revoked.</p>
        <Link href="/" className="text-accent hover:text-accent-hover font-mono text-sm">← Back to dashboard</Link>
      </div>
    </main>
  );
}
