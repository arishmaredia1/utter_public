import { useState } from "react";
import { useSession } from "@/store/session";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { Kbd } from "@/components/Kbd";

export function Login() {
  const { login, busy, err } = useSession();
  const [u, setU] = useState("");
  const [p, setP] = useState("");

  return (
    <main className="min-h-screen grid place-items-center px-6 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{ backgroundImage: "linear-gradient(#232936 1px, transparent 1px), linear-gradient(90deg, #232936 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      <form
        onSubmit={(e) => { e.preventDefault(); void login(u, p); }}
        className="relative z-10 w-full max-w-sm bg-bg-1 border border-line-1 rounded-lg p-8 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-center gap-2.5 mb-7">
          <Logo />
          <span className="font-display font-semibold text-lg tracking-tighter">Utter</span>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tighter mb-1">Welcome back.</h1>
        <p className="text-text-1 text-sm mb-6">Admin sign-in.</p>

        <label className="block mb-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-2 mb-1.5 block">Username</span>
          <input value={u} onChange={(e) => setU(e.target.value)} autoFocus required
            className="w-full bg-bg-2 border border-line-1 focus:border-line-2 outline-none rounded px-3 py-2 text-sm" />
        </label>
        <label className="block mb-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-2 mb-1.5 block">Password</span>
          <input type="password" value={p} onChange={(e) => setP(e.target.value)} required
            className="w-full bg-bg-2 border border-line-1 focus:border-line-2 outline-none rounded px-3 py-2 text-sm" />
        </label>
        {err && <p className="text-rec text-xs mb-4 font-mono uppercase tracking-wider">{err}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="mt-4 text-text-2 text-xs">Press <Kbd>↩</Kbd> to submit.</p>
      </form>
    </main>
  );
}
