/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: "#0d0c14",
        paper: "#f5f1e8",
        accent: "#ff5b3a",
        cool: "#5e6ee3",
        gold: "#e8c25c",
      },
      keyframes: {
        flip: {
          "0%": { transform: "rotateY(180deg)", opacity: "0" },
          "60%": { transform: "rotateY(-12deg)", opacity: "1" },
          "100%": { transform: "rotateY(0)", opacity: "1" },
        },
        rise: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        flip: "flip 600ms cubic-bezier(.2,.7,.2,1) both",
        rise: "rise 220ms cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [],
};
