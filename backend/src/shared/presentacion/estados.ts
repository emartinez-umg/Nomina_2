/** Presentación compartida por pantallas, notificaciones y documentos; no cambia los códigos. */
export const estados = {
  EN_PROCESO: { etiqueta: 'En proceso', color: 'aviso', icono: 'tiempo' },
  PENDIENTE: { etiqueta: 'Pendiente', color: 'aviso', icono: 'tiempo' },
  APROBADA: { etiqueta: 'Aprobada', color: 'correcto', icono: 'aprobar' },
  APROBADO: { etiqueta: 'Aprobado', color: 'correcto', icono: 'aprobar' },
  RECHAZADA: { etiqueta: 'Rechazada', color: 'peligro', icono: 'rechazar' },
  RECHAZADO: { etiqueta: 'Rechazado', color: 'peligro', icono: 'rechazar' },
  CANCELADA: { etiqueta: 'Cancelada', color: 'peligro', icono: 'cancelar' },
  CANCELADO: { etiqueta: 'Cancelado', color: 'peligro', icono: 'cancelar' },
  ANULADA: { etiqueta: 'Anulada', color: 'peligro', icono: 'cancelar' },
  ANULADO: { etiqueta: 'Anulado', color: 'peligro', icono: 'cancelar' },
  ENTREGADA: { etiqueta: 'Entregada', color: 'correcto', icono: 'documento' },
  TOMADA: { etiqueta: 'Tomada', color: 'correcto', icono: 'calendario' },
  APLICADA: { etiqueta: 'Aplicada', color: 'correcto', icono: 'completado' },
  APLICADO: { etiqueta: 'Aplicado', color: 'correcto', icono: 'completado' },
  ABIERTO: { etiqueta: 'Abierto', color: 'informacion', icono: 'documento' },
  BORRADOR: { etiqueta: 'Borrador', color: 'informacion', icono: 'editar' },
  CALCULADO: { etiqueta: 'Calculado', color: 'informacion', icono: 'planilla' },
  CALCULADA: { etiqueta: 'Calculada', color: 'informacion', icono: 'planilla' },
  REVISADO: { etiqueta: 'Revisado', color: 'informacion', icono: 'ver' },
  CERRADO: { etiqueta: 'Cerrado', color: 'correcto', icono: 'clave' },
  PAGADO: { etiqueta: 'Pagado', color: 'correcto', icono: 'completado' },
  PAGADA: { etiqueta: 'Pagada', color: 'correcto', icono: 'completado' },
  CONFIRMADO: { etiqueta: 'Confirmado', color: 'correcto', icono: 'completado' },
  REVERTIDO: { etiqueta: 'Revertido', color: 'peligro', icono: 'historial' },
  LIQUIDADO: { etiqueta: 'Liquidado', color: 'correcto', icono: 'completado' },
  PARCIAL: { etiqueta: 'Parcial', color: 'aviso', icono: 'tiempo' },
  VIGENTE: { etiqueta: 'Vigente', color: 'correcto', icono: 'correcto' },
  ACTIVA: { etiqueta: 'Activa', color: 'correcto', icono: 'correcto' },
  ACTIVO: { etiqueta: 'Activo', color: 'correcto', icono: 'correcto' },
  INACTIVA: { etiqueta: 'Inactiva', color: 'aviso', icono: 'cancelar' },
  INACTIVO: { etiqueta: 'Inactivo', color: 'aviso', icono: 'cancelar' },
  SUSPENDIDA: { etiqueta: 'Suspendida', color: 'aviso', icono: 'tiempo' },
  SUSPENDIDO: { etiqueta: 'Suspendido', color: 'aviso', icono: 'tiempo' },
  BAJA: { etiqueta: 'Baja', color: 'peligro', icono: 'cancelar' },
  EGRESADO: { etiqueta: 'Egresado', color: 'informacion', icono: 'salir' },
  LEIDA: { etiqueta: 'Leída', color: 'informacion', icono: 'ver' },
  NO_LEIDA: { etiqueta: 'Sin leer', color: 'aviso', icono: 'notificaciones' },
  REEMISION: { etiqueta: 'Reemisión', color: 'informacion', icono: 'documento' },
  SIMULACION: { etiqueta: 'Simulación', color: 'aviso', icono: 'ver' },
  FINALIZADA: { etiqueta: 'Finalizada', color: 'informacion', icono: 'completado' },
  ELIMINADO: { etiqueta: 'Eliminado', color: 'peligro', icono: 'eliminar' },
  OPERATIVO: { etiqueta: 'Operativo', color: 'correcto', icono: 'salud' },
  REQUIERE_REVISION: { etiqueta: 'Requiere revisión', color: 'peligro', icono: 'error' },
  VISTA_PREVIA: { etiqueta: 'Vista previa', color: 'informacion', icono: 'ver' },
  ENTREGADO: { etiqueta: 'Entregado', color: 'correcto', icono: 'documento' },
  REVERTIDA: { etiqueta: 'Revertida', color: 'peligro', icono: 'historial' },
  VALIDANDO: { etiqueta: 'Validando', color: 'aviso', icono: 'tiempo' },
  VALIDADA: { etiqueta: 'Validada', color: 'correcto', icono: 'correcto' },
  VALIDA: { etiqueta: 'Válida', color: 'correcto', icono: 'correcto' },
  INVALIDA: { etiqueta: 'Inválida', color: 'peligro', icono: 'error' },
  IMPORTADA: { etiqueta: 'Importada', color: 'correcto', icono: 'completado' },
  FALLIDA: { etiqueta: 'Fallida', color: 'peligro', icono: 'error' },
  OK: { etiqueta: 'Disponible', color: 'correcto', icono: 'correcto' },
} as const;
export type CodigoEstado = keyof typeof estados;
export function estadoPresentacion(codigo: string | null | undefined) {
  return (
    (codigo && Object.hasOwn(estados, codigo) ? estados[codigo as CodigoEstado] : undefined) ?? {
      etiqueta: 'Estado no disponible',
      color: 'informacion' as const,
      icono: 'informacion' as const,
    }
  );
}
export const etiquetaEstado = (codigo: string | null | undefined) =>
  estadoPresentacion(codigo).etiqueta;
export const opcionesEstado = (codigos: readonly string[]) =>
  codigos.map((value) => ({ value, label: etiquetaEstado(value) }));
