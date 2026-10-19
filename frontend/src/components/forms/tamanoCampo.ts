export type TipoCampo =
  | 'texto'
  | 'codigo'
  | 'zona'
  | 'dpi'
  | 'nit'
  | 'telefono'
  | 'fecha'
  | 'hora'
  | 'mes'
  | 'monto'
  | 'numero'
  | 'correo'
  | 'contrasena'
  | 'select'
  | 'textarea'
  | 'archivo';

/** Un número fuerza el tamaño en caracteres; completo conserva el tope de 640 px. */
export type TamanoCampo = number | 'corto' | 'medio' | 'ancho' | 'completo';
export interface TamanoProps {
  tipo?: TipoCampo | undefined;
  maxLength?: number | undefined;
  tamano?: TamanoCampo | undefined;
}

function caracteresTexto(limite: number) {
  if (limite <= 30) return Math.max(12, limite);
  if (limite <= 50) return Math.ceil(30 + ((limite - 30) * 14) / 20);
  return Math.min(60, Math.ceil(44 + ((limite - 50) * 12) / 50));
}

export function calcularAnchoCampo({ tipo = 'texto', maxLength, tamano }: TamanoProps = {}) {
  const limite = Number.isFinite(maxLength) && maxLength! > 0 ? maxLength! : 100;
  if (tamano === 'completo' || (!tamano && tipo === 'textarea')) return '40rem';
  const forzado = { corto: 12, medio: 30, ancho: 56 };
  let caracteres =
    typeof tamano === 'number'
      ? Number.isFinite(tamano) && tamano > 0
        ? Math.min(60, Math.max(8, tamano))
        : undefined
      : tamano
        ? forzado[tamano]
        : undefined;
  if (caracteres === undefined) {
    const porTipo = {
      codigo: 12,
      zona: 12,
      dpi: 18,
      nit: 18,
      telefono: 14,
      fecha: 16,
      hora: 12,
      mes: 28,
      monto: 16,
      numero: Math.max(12, Math.min(20, maxLength ?? 12)),
      correo: 36,
      contrasena: 36,
      select: Math.max(20, caracteresTexto(maxLength ?? 20)),
      archivo: 56,
      textarea: 60,
      texto: caracteresTexto(limite),
    };
    caracteres = porTipo[tipo];
  }
  // Incluye el espacio del control; etiquetas, hint y error comparten este mismo ancho.
  return `calc(${caracteres}ch + 2rem)`;
}
