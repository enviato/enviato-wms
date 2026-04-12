import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3c83f6",
        brand: {
          indipendence: "#484c5b",
          red: "#ef4444",
          capri: "#3c83f6",
          alabaster: "#e5e5dc",
          dark: "#484c5b",
          blue: "#3c83f6",
          cream: "#e5e5dc",
        },
        background: {
          light: "#f5f7f8",
          dark: "#101722",
        },
        surface: {
          DEFAULT: "#ffffff",
          secondary: "#f8fafc",
          hover: "#f1f5f9",
          active: "#e2e8f0",
        },
        border: {
          DEFAULT: "#e2e8f0",
          light: "#f1f5f9",
          dark: "#94a3b8",
        },
        txt: {
          primary: "#0f172a",
          secondary: "#334155",
          tertiary: "#64748b",
          placeholder: "#94a3b8",
          inverse: "#ffffff",
        },
        status: {
          green: "#10b981",
          orange: "#f59e0b",
          blue: "#3b82f6",
          red: "#ef4444",
          gray: "#64748b",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        display: [
          "Inter",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["18px", { lineHeight: "26px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "3xl": ["30px", { lineHeight: "36px" }],
      },
      letterSpacing: {
        tighter: "-0.36px",
        tight: "-0.2px",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        none: "none",
        sm: "0 1px 2px rgba(0,0,0,0.04)",
        DEFAULT: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        md: "0 4px 8px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)",
        lg: "0 8px 24px rgba(0,0,0,0.06), 0 4px 8px rgba(0,0,0,0.03)",
        xl: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
        "2xl": "0 25px 50px -12px rgba(0,0,0,0.25)",
        pill: "0px 1px 2px rgba(133,135,139,0.05), 0px 2px 6px rgba(133,135,139,0.02)",
        sidebar: "0px 0.17px 0.5px rgba(0,0,0,0.04), 0px 0.5px 1.5px rgba(0,0,0,0.02), 0px 2px 5px rgba(0,0,0,0.015), 0px 6px 18px rgba(0,0,0,0.01)",
        "bulk-modal": "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.05)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "slide-up": "slide-up 0.2s ease-out",
        "slide-down": "slide-down 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
