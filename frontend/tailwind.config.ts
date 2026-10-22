import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: {
          DEFAULT: "#0F172A",
          surface: "#1E293B",
          muted: "#334155",
        },
        canvas: "#F8FAFC",
        border: "#E2E8F0",
        slate: {
          text: "#64748B",
          border: "#E2E8F0",
          light: "#F1F5F9",
        },
        primary: {
          DEFAULT: "#1D4ED8",
          hover: "#1E40AF",
          subtle: "#EFF6FF",
        },
        semantic: {
          green: "#15803D",
          greenBg: "#F0FDF4",
          greenBorder: "#BBF7D0",
          amber: "#B45309",
          amberBg: "#FFFBEB",
          amberBorder: "#FDE68A",
          red: "#B91C1C",
          redBg: "#FEF2F2",
          redBorder: "#FECACA",
        },
      },
    },
  },
  plugins: [],
};
export default config;
