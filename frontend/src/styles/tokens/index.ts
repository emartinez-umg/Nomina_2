// Paleta, radios y espaciados aproximados visualmente a partir del PDF.
export const tokens = {
  colores: {
    marca: '#1f3a60',
    primario: '#2b622a',
    acento: '#2e245b',
    fondo: '#f5f5f5',
    superficie: '#ffffff',
    texto: '#1a1a1a',
    secundario: '#5f5f5f',
    borde: '#d1d1d1',
    peligro: '#a32626',
  },
  tipografia: ['Trebuchet MS', 'Arial', 'sans-serif'],
  radios: { tarjeta: '1rem', control: '0.75rem', boton: '999px' },
  sombras: { tarjeta: '0 8px 24px rgb(0 0 0 / 12%)' },
  espaciado: { seccion: '2rem', campo: '1rem' },
} as const;
