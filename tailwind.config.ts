import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          50: "#f6f7f8",
          100: "#eceef1",
          200: "#d5dae0",
          300: "#b1b9c4",
          400: "#7e8a9a",
          500: "#5b6779",
          600: "#414c5d",
          700: "#2f3849",
          800: "#1c2230",
          900: "#11151f",
          950: "#080b13",
        },
        accent: {
          50: "#fff8eb",
          100: "#ffeac6",
          200: "#ffd388",
          300: "#ffb74a",
          400: "#ff9d20",
          500: "#f57c00",
          600: "#d95f02",
          700: "#b34406",
          800: "#90360c",
          900: "#762d0e",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17,21,31,0.06), 0 4px 16px rgba(17,21,31,0.04)",
        pop: "0 8px 28px rgba(17,21,31,0.12)",
        lift:
          "0 22px 50px -12px rgba(17,21,31,0.18), 0 10px 24px -10px rgba(17,21,31,0.1), inset 0 1px 0 rgba(255,255,255,0.65)",
        "lift-sm":
          "0 14px 32px -8px rgba(17,21,31,0.14), 0 6px 14px -6px rgba(17,21,31,0.08), inset 0 1px 0 rgba(255,255,255,0.55)",
      },
      keyframes: {
        "flowio-float-slow": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(8px, -12px) scale(1.03)" },
          "66%": { transform: "translate(-10px, 6px) scale(0.98)" },
        },
      },
      animation: {
        "flowio-float-slow": "flowio-float-slow 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
