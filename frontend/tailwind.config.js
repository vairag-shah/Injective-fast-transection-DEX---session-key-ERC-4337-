/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                display: ["Space Grotesk", "sans-serif"],
                mono: ["IBM Plex Mono", "monospace"]
            },
            colors: {
                bg: "#0b1118",
                panel: "#111b26",
                panel2: "#132332",
                accent: "#24d98c",
                danger: "#ff5f58",
                amber: "#ffb04d"
            },
            boxShadow: {
                glow: "0 0 0 1px rgba(36,217,140,0.35), 0 8px 30px rgba(36,217,140,0.15)"
            },
            keyframes: {
                pulseDot: {
                    "0%,100%": { opacity: "1", transform: "scale(1)" },
                    "50%": { opacity: "0.35", transform: "scale(0.8)" }
                },
                rise: {
                    "0%": { opacity: "0", transform: "translateY(12px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" }
                }
            },
            animation: {
                pulseDot: "pulseDot 1.2s ease-in-out infinite",
                rise: "rise 400ms ease-out both"
            }
        }
    },
    plugins: []
};
