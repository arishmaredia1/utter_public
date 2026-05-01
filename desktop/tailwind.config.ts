import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { 0: "#08090C", 1: "#0E1117", 2: "#161A22", 3: "#1F2530" },
        line: { 1: "#232936", 2: "#2D3548" },
        text: { 0: "#ECEEF2", 1: "#8B92A4", 2: "#5A6072" },
        accent: { DEFAULT: "#4F8AF7", hover: "#6BA3FF", tint: "rgba(79,138,247,.12)" },
        rec: "#FF4D58",
        ok: "#12B981",
        warn: "#F5A524",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px", xl: "14px" },
      letterSpacing: { tightest: "-0.04em", tighter: "-0.025em", wide: "0.04em", wider: "0.12em", widest: "0.18em" },
    },
  },
  plugins: [],
} satisfies Config;
