import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Pharma pack dark surfaces: an indigo-black ramp (business-system indigo
        // family, canon "Design grammar"), replacing the tobacco leaf-brown ramp.
        plant: {
          950: '#0b0d1a',
          900: '#111427',
          850: '#161a30',
          800: '#1e2340',
          700: '#2f365e',
        },
        // Family re-skin: the donor app uses violet-* as its accent throughout.
        // The pharma edition remaps violet → teal (MES = teal in the pack palette)
        // without touching a single component class. Do NOT "fix" violet-* classes.
        violet: colors.teal,
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'andon-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'andon-pulse': 'andon-pulse 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
