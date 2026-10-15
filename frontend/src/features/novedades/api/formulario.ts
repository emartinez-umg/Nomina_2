import { z } from 'zod';
import Decimal from 'decimal.js';
import { fechaValida } from '../../../lib/validadores';
import type { Fila, Tipo } from './novedades';
export interface Campo {
  nombre: string;
  label: string;
  hint: string;
  tipo: 'referencia' | 'opcion' | 'fecha' | 'mes' | 'dinero' | 'numero' | 'texto' | 'area';
  opciones?: string[];
  ref?: string;
  ancho?: 'corto' | 'medio' | 'ancho';
  opcional?: boolean;
}
const motivo: Campo = {
  nombre: 'motivo',
  label: 'Motivo o descripción',
  tipo: 'area',
  hint: 'Explica el origen o cambio con 5–500 caracteres. Queda en auditoría.',
  ancho: 'ancho',
};
const monto: Campo = {
  nombre: 'monto',
  label: 'Monto total',
  tipo: 'dinero',
  hint: 'Capital o total a descontar; Q, hasta dos decimales. Mayor que cero.',
  ancho: 'corto',
};
const cuotas: Campo = {
  nombre: 'cuotas',
  label: 'Número de cuotas',
  tipo: 'numero',
  hint: 'Entre 1 y 600. Se distribuyen por mes; la última ajusta los centavos.',
  ancho: 'corto',
};
const inicio: Campo = {
  nombre: 'fechaInicio',
  label: 'Fecha de inicio',
  tipo: 'fecha',
  hint: 'El descuento comienza en esta fecha; las cuotas vencen al cierre de cada mes.',
  ancho: 'corto',
};
const mes: Campo = {
  nombre: 'mes',
  label: 'Mes y año',
  tipo: 'mes',
  hint: 'Mes actual o anterior, sin periodos cerrados. Se registra el total del mes.',
  ancho: 'corto',
};
const estado: Campo = {
  nombre: 'estado',
  label: 'Estado de autorización',
  tipo: 'opcion',
  hint: 'Solo las aprobadas alimentarán el cálculo. Aprobar o rechazar exige confirmación.',
  opciones: ['PENDIENTE', 'APROBADA', 'RECHAZADA'],
};
const referencia: Campo = {
  nombre: 'referencia',
  label: 'Referencia',
  tipo: 'texto',
  hint: 'Identificador del respaldo, hasta 100 caracteres. No lo repitas para el mismo empleado y mes.',
};
const tipo = (ref: string): Campo => ({
  nombre: 'idTipo',
  label: 'Tipo',
  tipo: 'referencia',
  hint: 'Elige un tipo activo. Los efectos se administran en Catálogos.',
  ref,
});
export function campos(tipoN: Tipo, modalidad = 'CUOTAS'): Campo[] {
  const comun: Campo[] = [
    {
      nombre: 'idEmpleado',
      label: 'Empleado',
      tipo: 'referencia',
      hint: 'Busca por nombre o código y selecciona un empleado activo.',
      ref: 'empleados',
    },
  ];
  const porTipo: Record<Tipo, Campo[]> = {
    descuentos: [
      tipo('descuentos'),
      {
        nombre: 'modalidad',
        label: 'Modalidad',
        tipo: 'opcion',
        hint: 'Fijo se repite cada mes; cuotas distribuye un total; único se cobra una vez.',
        opciones: ['FIJO', 'CUOTAS', 'UNICO'],
      },
      { ...monto, label: modalidad === 'FIJO' ? 'Monto por mes' : 'Monto total' },
      ...(modalidad === 'CUOTAS' ? [cuotas] : []),
      inicio,
      ...(modalidad === 'FIJO'
        ? [
            {
              nombre: 'fechaFin',
              label: 'Fecha final (opcional)',
              tipo: 'fecha' as const,
              hint: 'Vacía para mantenerlo vigente. No anterior al inicio.',
              ancho: 'corto' as const,
              opcional: true,
            },
          ]
        : []),
    ],
    prestamos: [
      tipo('prestamos'),
      monto,
      cuotas,
      {
        ...inicio,
        label: 'Primera cuota',
        hint: 'Hoy o una fecha futura. Vence al final de la mes elegido.',
      },
      {
        nombre: 'fechaDesembolso',
        label: 'Fecha de desembolso',
        tipo: 'fecha',
        hint: 'Desde el ingreso y hasta la primera cuota.',
        ancho: 'corto',
      },
      referencia,
    ],
    comisiones: [mes, { ...monto, label: 'Comisión' }, referencia],
    'consumo-tienda': [mes, { ...monto, label: 'Consumo en tienda' }, referencia],
    'horas-extra': [
      mes,
      {
        nombre: 'horas',
        label: 'Horas registradas',
        tipo: 'numero',
        hint: 'Horas completas o medias horas, por ejemplo 2.5. Un total por empleado y mes; superar el tope mensual requiere revisión.',
        ancho: 'corto',
      },
    ],
    ausencias: [
      tipo('ausencias'),
      inicio,
      {
        nombre: 'fechaFin',
        label: 'Fecha final',
        tipo: 'fecha',
        hint: 'Igual o posterior al inicio. No puede cruzar rangos ocupados ni periodos cerrados.',
        ancho: 'corto',
      },
      estado,
    ],
  };
  return [...comun, ...porTipo[tipoN], motivo];
}
export function iniciales(tipo: Tipo, hoy: string, actual?: Fila) {
  const valores: Record<string, string> = {
    idEmpleado: '',
    idTipo: '',
    modalidad: 'CUOTAS',
    monto: '',
    cuotas: '1',
    fechaInicio: hoy,
    fechaFin: '',
    fechaDesembolso: hoy,
    fecha: hoy,
    mes: hoy.slice(0, 7),
    referencia: '',
    horas: '',
    jornada: 'DIURNA',
    estado: 'PENDIENTE',
    motivo: '',
  };
  if (actual) {
    for (const key of Object.keys(valores)) {
      const v = actual[key as keyof Fila];
      if (typeof v === 'string' || typeof v === 'number') valores[key] = String(v);
    }
    valores.fecha = tipo === 'comisiones' ? actual.fechaInicio : (actual.fecha ?? hoy);
    if (actual.fechaFin === '9999-12-31' || actual.modalidad !== 'FIJO')
      valores.fechaFin = tipo === 'ausencias' ? (actual.fechaFin ?? '') : '';
    valores.motivo = '';
  }
  return valores;
}
export function schemaFormulario(tipo: Tipo, hoy: string) {
  return z.record(z.string()).superRefine((d, ctx) => {
    const error = (key: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [key], message });
    for (const f of campos(tipo, d.modalidad)) {
      const v = (d[f.nombre] ?? '').trim().replace(f.tipo === 'dinero' ? /,/g : /$^/g, '');
      if (!v && f.opcional) continue;
      if (!v) {
        error(f.nombre, 'Completa este campo antes de continuar.');
        continue;
      }
      if (f.tipo === 'referencia' && !/^[1-9]\d*$/.test(v))
        error(f.nombre, 'Selecciona una opción de la lista.');
      if (f.tipo === 'opcion' && !f.opciones?.includes(v))
        error(f.nombre, 'Selecciona una opción válida.');
      if (f.tipo === 'mes' && (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(v) || v > hoy.slice(0, 7)))
        error(f.nombre, 'Selecciona un mes actual o anterior válido.');
      if (f.tipo === 'fecha' && !fechaValida(v))
        error(f.nombre, 'Ingresa una fecha real con formato dd/mm/aaaa.');
      if (f.tipo === 'dinero' && (!/^\d{1,10}(\.\d{1,2})?$/.test(v) || !new Decimal(v || 0).gt(0)))
        error(f.nombre, 'Ingresa un monto mayor que cero con hasta dos decimales.');
      if (f.nombre === 'cuotas' && (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 600))
        error(f.nombre, 'Indica entre 1 y 600 cuotas enteras.');
      if (
        f.nombre === 'horas' &&
        (!/^\d+(\.\d{1,2})?$/.test(v) ||
          !new Decimal(v || 0).gt(0) ||
          !new Decimal(v || 0).mod('0.5').isZero())
      )
        error(
          f.nombre,
          'Ingresa horas mayores que cero en múltiplos de media hora, por ejemplo 2.5.',
        );
      if (f.nombre === 'motivo' && (v.length < 5 || v.length > 500))
        error(f.nombre, 'Explica el motivo con 5–500 caracteres.');
      if (f.nombre === 'referencia' && v.length > 100) error(f.nombre, 'Usa hasta 100 caracteres.');
    }
    if (d.fechaFin && d.fechaInicio && d.fechaFin < d.fechaInicio)
      error('fechaFin', 'La fecha final no puede ser anterior al inicio.');
    if (tipo === 'prestamos' && d.fechaInicio! < hoy)
      error('fechaInicio', 'La primera cuota debe ser hoy o futura.');
    if (tipo === 'prestamos' && d.fechaDesembolso! > d.fechaInicio!)
      error('fechaDesembolso', 'El desembolso no puede ser posterior a la primera cuota.');
  });
}
export function cuerpo(tipo: Tipo, d: Record<string, string>) {
  const out: Record<string, unknown> = { confirmado: true };
  for (const f of campos(tipo, d.modalidad)) {
    const v = d[f.nombre] ?? '';
    out[f.nombre] =
      f.tipo === 'referencia' || f.nombre === 'cuotas'
        ? Number(v)
        : f.tipo === 'dinero'
          ? v.replace(/,/g, '')
          : v || null;
  }
  if (tipo === 'descuentos') {
    out.cuotas = d.modalidad === 'FIJO' ? null : d.modalidad === 'UNICO' ? 1 : Number(d.cuotas);
    out.fechaFin = d.modalidad === 'FIJO' ? d.fechaFin || null : null;
  }
  return out;
}
