import type { Config } from 'tailwindcss';
import { tokens } from './src/styles/tokens/index';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: tokens.colores,
      fontFamily: { sans: [...tokens.tipografia] },
      borderRadius: tokens.radios,
      boxShadow: tokens.sombras,
      spacing: tokens.espaciado,
    },
  },
  plugins: [],
} satisfies Config;
