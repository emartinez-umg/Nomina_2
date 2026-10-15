import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaParqueo: DefinicionAyuda = {
  id: 'parqueo-v1-9',
  pasos: [
    {
      elemento: 'parqueo-filtros',
      titulo: 'Suscripción mensual',
      descripcion:
        'Elige un mes para consultar su tarifa y referencia de pago. Combina búsqueda y estado; puedes contraer los filtros o quitar un chip activo. CSV exporta toda la consulta. La lista conserva altas, bajas y suspensiones. El cargo es mensual completo desde el mes aprobado; no se prorratea.',
    },
    {
      elemento: 'parqueo-cambio',
      titulo: 'Confirmar una gestión',
      descripcion:
        'Escribe un motivo de 5 a 500 caracteres y revisa la confirmación. La solicitud de baja del empleado requiere resolución de RRHH. Dar de baja o suspender conserva el cargo mensual actual. Los datos quedan en borrador mientras decides y la operación se audita al confirmar.',
    },
    {
      elemento: 'parqueo-tabla',
      titulo: 'Baja y suspensión',
      descripcion:
        'El empleado puede solicitar la baja de su propia suscripción; RRHH recibe el aviso y debe resolverla. RRHH puede dar de baja o suspender con motivo y confirmación. Estas gestiones afectan el mes actual, aunque consultes otro mes, y se bloquean si está cerrado. El mes en curso se cobra completo y los siguientes ya no se cobran. Una suscripción finalizada requiere una nueva solicitud para volver a activar parqueo.',
    },
    {
      elemento: 'parqueo-tabla',
      titulo: 'Revisar registros migrados',
      descripcion:
        'Si falta vehículo, RRHH debe completar Carro o Moto y configurar su tarifa real. El importe quincenal anterior se conserva como referencia, sin inventar una tarifa mensual. Los cobros históricos se conservan y nunca se vuelven a aplicar.',
      roles: ['RH', 'ADMIN'],
    },
    {
      elemento: 'tarifas-parqueo',
      titulo: 'Tarifas con vigencia',
      descripcion:
        'Configura Carro y Moto por mes. Verifica el valor anterior y nuevo, escribe un motivo y confirma. Una nueva vigencia termina la anterior; no modifica pagos ni periodos cerrados.',
      roles: ['RH', 'ADMIN'],
    },
  ],
};
export const ayudaPendientes: DefinicionAyuda = {
  id: 'novedades-pendientes-v1-9',
  pasos: [
    {
      elemento: 'pendientes-filtros',
      titulo: 'Revisión antes del pago',
      descripcion:
        'Selecciona el mes actual o uno anterior y busca empleado o departamento. Contrae los filtros para ganar espacio; quita un chip o limpia filtros para ampliar resultados. CSV exporta toda la consulta. Incluye novedades pendientes de meses anteriores. No realiza pagos ni modifica estados.',
    },
    {
      elemento: 'pendientes-departamentos',
      titulo: 'Resumen por departamento',
      descripcion:
        'Los totales abarcan todos los empleados del filtro, no solo la página. Alertas identifica registros sin importe calculable o pendientes de autorización.',
    },
    {
      elemento: 'pendientes-empleados',
      titulo: 'Comprobar cargas',
      descripcion:
        'Revisa horas extra, comisiones, consumos, ausencias y parqueo de cada empleado. Sin registro indica que no se ha cargado ese concepto; puede ser correcto y debe comprobarse con los respaldos. Las novedades retroactivas conservan su mes de origen. Corrige las alertas antes de pagar.',
    },
  ],
};

export const ayudaTarifas: DefinicionAyuda = { ...ayudaParqueo, id: 'tarifas-parqueo-v1-9' };
