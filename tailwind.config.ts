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
      },
    },
  },
  plugins: [],
};

export default config;
