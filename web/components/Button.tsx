import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: Props) {
  const base = "inline-flex items-center justify-center rounded font-medium select-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizing = size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm";
  const skin =
    variant === "primary" ? "bg-accent text-white hover:bg-accent-hover" :
    variant === "danger"  ? "bg-rec text-white hover:bg-[#FF6670]" :
                            "bg-bg-3 text-text-0 border border-line-2 hover:bg-line-2";
  return <button className={`${base} ${sizing} ${skin} ${className}`} {...rest} />;
}
