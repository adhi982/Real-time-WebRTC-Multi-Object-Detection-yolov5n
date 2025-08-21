/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#111827',
        'dark-surface': '#1F2937',
        'dark-surface-light': '#374151',
        'dark-primary': '#3B82F6',
        'dark-primary-hover': '#2563EB',
        'dark-primary-light': '#60A5FA',
        'dark-text': '#F9FAFB',
        'dark-text-secondary': '#D1D5DB',
        'dark-text-muted': '#9CA3AF',
        'dark-border': 'rgba(255, 255, 255, 0.1)',
        'dark-success': '#10B981',
        'dark-warning': '#F59E0B',
        'dark-danger': '#EF4444',
      },
      fontFamily: {
        'inter': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 2s infinite',
        'spin-slow': 'spin 2s linear infinite',
      }
    },
  },
  plugins: [],
}
