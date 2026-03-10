import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Dark mode is toggled by adding the `dark` class to <html>
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Loaded via next/font/google and exposed as CSS variables
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      colors: {
        // Single warm amber accent — used sparingly for focus states and CTAs
        accent: {
          DEFAULT: "#C97B2E",
          soft: "#F0C07A",
        },
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.25,0.1,0.25,1) forwards",
        "fade-in": "fade-in 0.4s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
