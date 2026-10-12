// Muestreo del PDF, páginas 1 y 6 (1600 × 900); medidas normalizadas a desktop.
export const tokens = {
  colores: {
    marca: '#1d395e',
    primario: '#28622a',
    acento: '#2e245b',
    fondo: '#f4f4f4',
    superficie: '#ffffff',
    texto: '#1d395e',
    secundario: '#576573',
    borde: '#d5dde2',
    peligro: '#a32626',
    suave: '#e8f0e8',
    aviso: '#856000',
    informacion: '#e6eef3',
  },
  tipografia: ['Trebuchet MS', 'Arial', 'sans-serif'],
  radios: { tarjeta: '0.75rem', control: '0.625rem', boton: '999px' },
  sombras: { tarjeta: '0 8px 20px rgb(0 0 0 / 12%)', barra: '0 3px 6px rgb(0 0 0 / 10%)' },
  espaciado: { seccion: '2rem', campo: '1rem', sidebar: '15rem', cabecera: '4.5rem' },
} as const;
