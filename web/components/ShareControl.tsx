"use client";
import { useState } from "react";
import { Button } from "./Button";

export function ShareControl({ recordingId, initialToken, baseUrl }: { recordingId: string; initialToken: string | null; baseUrl: string }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function mint() {
    setBusy(true);
    const res = await fetch(`/api/recordings/${recordingId}/share`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setToken(data.token as string);
  }
  async function revoke() {
    if (!confirm("Revoke this share link? Anyone with the URL will lose access.")) return;
    setBusy(true);
    await fetch(`/api/recordings/${recordingId}/share`, { method: "DELETE" });
    setBusy(false);
    setToken(null);
  }
  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(`${baseUrl}/share/${token}`);
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  }

  if (!token) {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={mint} disabled={busy} variant="ghost" size="sm">
          {busy ? "Creating…" : "Create share link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-1.5 border border-accent/30 bg-accent/[0.06] rounded-md">
      <span className="font-mono text-[11.5px] text-accent px-2 tracking-wide">
        {baseUrl.replace(/^https?:\/\//, "")}/share/{token}
      </span>
      <Button onClick={copy} variant="ghost" size="sm">
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button onClick={revoke} disabled={busy} variant="danger" size="sm">Revoke</Button>
    </div>
  );
}
