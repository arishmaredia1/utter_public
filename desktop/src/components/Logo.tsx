export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-md bg-accent text-white font-display font-bold leading-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),0_4px_12px_rgba(79,138,247,0.3)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), letterSpacing: "-0.04em" }}
      aria-hidden
    >U</span>
  );
}
