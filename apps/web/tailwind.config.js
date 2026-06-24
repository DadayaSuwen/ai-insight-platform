/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {},
  },
  plugins: [require("@tailwindcss/typography"), require("tailwindcss-animate")],
  // Safelist to ensure Tailwind classes are detected during development
  safelist: [
    // Common utility classes that will be used
    "bg-white",
    "text-black",
    "p-4",
    "m-2",
  ],
};
