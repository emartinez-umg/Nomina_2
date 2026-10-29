import { estados, etiquetaEstado } from './estados.js';
const etiquetas: Record<string, string> = {
  CARRO: 'Carro',
  MOTO: 'Moto',
  DIURNA: 'Diurna',
  MIXTA: 'Mixta',
  NOCTURNA: 'Nocturna',
  comisiones: 'Comisiones',
  'horas-extra': 'Horas extra',
  'consumo-tienda': 'Consumo en tienda',
  descuentos: 'Descuentos',
  prestamos: 'Préstamos',
  ausencias: 'Ausencias',
  COMISION: 'Comisión',
  BONIFICACION_INCENTIVO: 'Bonificación incentivo',
  UNICO: 'Único',
  VACACIONES_PENDIENTES: 'Vacaciones pendientes',
  ANULACION: 'Anulación',
  BONO_14: 'Bono 14',
  AGUINALDO: 'Aguinaldo',
  INDEMNIZACION: 'Indemnización',
  ANTICIPO: 'Anticipo',
  PAGO: 'Pago del mes',
  CON_GOCE: 'Con goce',
  SIN_GOCE: 'Sin goce',
  SUBSIDIO_IGSS: 'Subsidio IGSS',
  IGSS_JUSTIFICADA: 'Justificada por IGSS',
  JUSTIFICADA_CON_GOCE: 'Justificada con goce',
  JUSTIFICADA_SIN_GOCE: 'Justificada sin goce',
  SIN_JUSTIFICAR: 'Sin justificación',
  CONSUMO_TIENDA: 'Consumo en tienda',
  CONSTANCIA_LABORAL: 'Constancia laboral',
  CERTIFICADO_IGSS: 'Certificado IGSS',
  CONSTANCIA_INTECAP: 'Constancia INTECAP',
  ACTUALIZACION_DATOS: 'Actualización de datos',
  ADMIN: 'Administración',
  RH: 'Recursos Humanos',
  EMPLEADO: 'Empleado',
};
/** Solo para campos enumerados/técnicos; nunca transformar códigos públicos ni texto libre. */
export function etiquetaCodigo(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  if (Object.hasOwn(estados, codigo)) return etiquetaEstado(codigo);
  return (
    (Object.hasOwn(etiquetas, codigo) ? etiquetas[codigo] : undefined) ??
    (/[A-Z]/.test(codigo) && codigo === codigo.toUpperCase()
      ? codigo
          .toLocaleLowerCase('es-GT')
          .replace(/_/g, ' ')
          .replace(/^./u, (c) => c.toUpperCase())
      : codigo)
  );
}
/** Retira códigos internos conocidos en mensajes históricos sin modificar el registro guardado. */
export function textoPresentacion(texto: string): string {
  return texto.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/g, (c) =>
    /^(?:EMP|SOL|PRE|DES|EVT|ANU|ACT)_/.test(c) ||
    (!c.includes('_') && !Object.hasOwn(estados, c) && !Object.hasOwn(etiquetas, c))
      ? c
      : etiquetaCodigo(c),
  );
}
