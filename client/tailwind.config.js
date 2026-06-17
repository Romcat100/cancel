/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Hanken Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Spline Sans Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Fable: Interference — deep indigo void, soft white text, glowing signals.
        ink: "#12102e",
        paper: "#eef0fb",
        accent: "#ff7a5c", // warm coral — the brand / CTA signal
        cool: "#6fa8ff", // ice blue
        gold: "#ffd166",
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
        "ping-target": {
          "0%": { transform: "translateX(0) scale(1)", boxShadow: "0 0 0 0 rgba(255,122,92,0.6)" },
          "10%": { transform: "translateX(-6px) scale(1.06)", boxShadow: "0 0 0 4px rgba(255,122,92,0.4)" },
          "20%": { transform: "translateX(6px) scale(1.08)", boxShadow: "0 0 0 10px rgba(255,122,92,0.25)" },
          "32%": { transform: "translateX(-5px) scale(1.06)" },
          "44%": { transform: "translateX(4px) scale(1.04)", boxShadow: "0 0 0 16px rgba(255,122,92,0)" },
          "60%": { transform: "translateX(-3px) scale(1.02)" },
          "78%": { transform: "translateX(1.5px) scale(1.01)" },
          "100%": { transform: "translateX(0) scale(1)", boxShadow: "0 0 0 0 rgba(255,122,92,0)" },
        },
        "ping-sender": {
          "0%": { boxShadow: "0 0 0 0 rgba(238,240,251,0.7)" },
          "60%": { boxShadow: "0 0 0 8px rgba(238,240,251,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(238,240,251,0)" },
        },
        "ping-wiggle": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-2px)" },
          "75%": { transform: "translateX(2px)" },
        },
      },
      animation: {
        flip: "flip 600ms cubic-bezier(.2,.7,.2,1) both",
        rise: "rise 220ms cubic-bezier(.2,.7,.2,1) both",
        "ping-target": "ping-target 800ms cubic-bezier(.2,.7,.2,1) both",
        "ping-sender": "ping-sender 500ms cubic-bezier(.2,.7,.2,1) both",
        "ping-wiggle": "ping-wiggle 350ms ease-in-out both",
      },
    },
  },
  plugins: [],
};
