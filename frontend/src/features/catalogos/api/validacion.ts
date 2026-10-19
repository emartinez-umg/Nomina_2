import {
  validarNombreCatalogo,
  recortarNombreCatalogo,
} from '../../../../../backend/src/shared/catalogos/nombre';
import type { LimitesHorario, BloqueHorario } from './catalogos';
import {
  analizarHorario,
  normalizarBloques,
} from '../../../../../backend/src/shared/horarios/modelo';
import { bloqueSchema } from './catalogos';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { fechaValida, nitSchema, correoSchema, telefonoSchema } from '../../../lib/validadores';
import type { Catalogo, Fila } from './catalogos';
export function valoresIniciales(cat: Catalogo, fila?: Fila): Record<string, string> {
  const d: Record<string, string> = {};
  for (const f of cat.campos)
    d[f.nombre] =
      fila?.[f.nombre] == null
        ? f.tipo === 'booleano'
          ? '0'
          : ''
        : f.tipo === 'booleano'
          ? fila[f.nombre]
            ? '1'
            : '0'
          : String(fila[f.nombre]);
  if (fila?.claveInterna) d.claveInterna = String(fila.claveInterna);
  if (fila?.codigoAnterior) d.codigoAnterior = String(fila.codigoAnterior);
  if (cat.slug === 'horarios') d.bloques = JSON.stringify(fila?.bloques ?? []);
  if (cat.slug === 'feriados' && !fila) {
    d.ambito = 'NACIONAL';
    d.localidad = '*';
    d.minutoInicio = '0';
    d.minutoFin = '1440';
  }
  return d;
}
export function schemaFormulario(
  cat: Catalogo,
  cierre: string | null,
  limites?: LimitesHorario | null,
  anteriores?: BloqueHorario[],
) {
  return z.record(z.string()).superRefine((d, ctx) => {
    const error = (campo: string, mensaje: string) =>
      ctx.addIssue({ code: 'custom', path: [campo], message: mensaje });
    for (const f of cat.campos) {
      if (f.tipo === 'codigo' || (cat.slug === 'horarios' && f.nombre === 'jornada')) continue;
      const v = d[f.nombre]?.trim() ?? '';
      if (f.nombre === 'nombre') {
        const mensaje = validarNombreCatalogo(d[f.nombre] ?? '', f.max);
        if (mensaje) error(f.nombre, mensaje);
        continue;
      }
      if (!v) {
        if (f.requerido) error(f.nombre, 'Este campo es obligatorio. Ingresa el dato solicitado.');
        continue;
      }
      const formato = { nit: nitSchema, correo: correoSchema, telefono: telefonoSchema }[
        f.tipo as 'nit' | 'correo' | 'telefono'
      ];
      if (formato && !formato.safeParse(v).success)
        error(f.nombre, 'Revisa el formato indicado en la ayuda del campo.');
      if (f.max && (f.tipo === 'telefono' ? v.replace(/\s/g, '').length : v.length) > f.max)
        error(f.nombre, `Usa hasta ${f.max} caracteres.`);
      if (f.tipo === 'fecha' && (!fechaValida(v) || v < '1900-01-01'))
        error(f.nombre, 'Ingresa una fecha válida en formato dd/mm/aaaa.');
      if (['dinero', 'decimal', 'entero', 'referencia'].includes(f.tipo)) {
        const n = v.replace(/,/g, '');
        const dec = f.tipo === 'dinero' ? 2 : f.tipo === 'decimal' ? (f.decimales ?? 6) : 0;
        if (!(dec ? new RegExp(`^\\d{1,12}(\\.\\d{1,${dec}})?$`) : /^\d+$/).test(n)) {
          error(f.nombre, 'Ingresa un número positivo con los decimales permitidos.');
          continue;
        }
        const valor = new Decimal(n);
        if (f.tipo === 'dinero' && valor.gt('9999999999.99'))
          error(f.nombre, 'El monto supera Q 9,999,999,999.99.');
        if (f.tipo === 'referencia' && valor.lte(0))
          error(f.nombre, 'Selecciona un registro válido.');
        if (f.tipo === 'entero' && valor.gt(1440))
          error(f.nombre, 'El valor máximo es 1440 minutos.');
        if (
          (f.nombre === 'tasaPorcentaje' || (f.nombre === 'valor' && d.unidad === 'PORCENTAJE')) &&
          valor.gt(100)
        )
          error(f.nombre, 'El porcentaje debe estar entre 0 y 100.');
      }
      if (f.tipo === 'opcion' && !f.opciones?.includes(v))
        error(f.nombre, 'Selecciona una opción de la lista.');
    }
    if (cat.slug === 'parametros-legales' && /^\d+(\.\d+)?$/.test(d.valor ?? '')) {
      const valor = new Decimal(d.valor!);
      const clave =
        d.claveInterna ||
        d.codigoAnterior ||
        d.nombre
          ?.toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9 ]/g, '')
          .trim()
          .replace(/ +/g, '_');
      const max = clave?.endsWith('_DIA') ? 31 : clave?.endsWith('_MES') ? 12 : null;
      if (max !== null && (!valor.isInteger() || valor.lt(1) || valor.gt(max)))
        error('valor', `Ingresa un entero entre 1 y ${max} para esta posición del calendario.`);
      if (/^JORNADA_.*_HORAS_SEMANA$/.test(clave ?? '') && (valor.lte(0) || valor.gt(168)))
        error('valor', 'Las horas semanales deben superar 0 y no exceder 168.');
      if (/^JORNADA_.*_HORAS$/.test(clave ?? '') && (valor.lte(0) || valor.gt(24)))
        error('valor', 'La duración de una jornada debe superar 0 y no exceder 24 horas.');
    }
    const comparables = (a: string, b: string) =>
      !!d[a] &&
      !!d[b] &&
      /^\d+(\.\d+)?$/.test(d[a]!.replace(/,/g, '')) &&
      /^\d+(\.\d+)?$/.test(d[b]!.replace(/,/g, ''));
    if (
      cat.slug === 'puestos' &&
      (!!d.salarioMinimo !== !!d.salarioMaximo ||
        (comparables('salarioMinimo', 'salarioMaximo') &&
          new Decimal(d.salarioMinimo!.replace(/,/g, '')).gt(d.salarioMaximo!.replace(/,/g, ''))))
    )
      error('salarioMaximo', 'Ingresa ambos límites; el máximo debe ser igual o mayor al mínimo.');
    if (d.vigenteHasta && d.vigenteDesde! > d.vigenteHasta)
      error('vigenteHasta', 'La fecha final debe ser igual o posterior a la inicial.');
    if (cierre && d.vigenteDesde && d.vigenteDesde <= cierre)
      error('vigenteDesde', 'La vigencia debe comenzar después del último periodo cerrado.');
    if (
      cat.slug === 'tramos-isr' &&
      comparables('limiteInferior', 'limiteSuperior') &&
      new Decimal(d.limiteInferior!.replace(/,/g, '')).gte(d.limiteSuperior!.replace(/,/g, ''))
    )
      error('limiteSuperior', 'El límite superior debe superar el inferior.');
    if (cat.slug === 'feriados') {
      if (Number(d.minutoFin) <= Number(d.minutoInicio))
        error('minutoFin', 'El fin debe ser posterior al inicio.');
      if (
        (d.ambito === 'NACIONAL' && d.localidad !== '*') ||
        (d.ambito === 'LOCAL' && d.localidad === '*')
      )
        error('localidad', 'Para nacional usa *; para local ingresa la localidad.');
    }
    if (cat.slug === 'horarios') {
      let bloques;
      try {
        bloques = z.array(bloqueSchema).parse(JSON.parse(d.bloques ?? '[]'));
      } catch {
        error('bloques', 'Revisa los bloques del horario.');
        return;
      }
      const iguales =
        anteriores &&
        JSON.stringify(normalizarBloques(anteriores)) ===
          JSON.stringify(normalizarBloques(bloques));
      if (!iguales && limites === null)
        error(
          'bloques',
          'Espera a que carguen los límites de jornadas; si faltan, completa Parámetros legales.',
        );
      for (const mensaje of analizarHorario(
        bloques,
        iguales ? undefined : (limites ?? undefined),
        !iguales,
      ).errores)
        error('bloques', mensaje);
    }
  });
}
export function cuerpo(cat: Catalogo, d: Record<string, string>) {
  const body: Record<string, unknown> = {};
  for (const f of cat.campos) {
    if (f.tipo === 'codigo') continue;
    const original =
      f.nombre === 'nombre'
        ? recortarNombreCatalogo(d[f.nombre] ?? '')
        : (d[f.nombre]?.trim() ?? '');
    const v =
      f.tipo === 'telefono'
        ? original.replace(/\s/g, '')
        : f.tipo === 'correo'
          ? original.toLowerCase()
          : original;
    body[f.nombre] = !v
      ? null
      : f.tipo === 'booleano'
        ? v === '1'
        : ['entero', 'referencia'].includes(f.tipo)
          ? Number(v)
          : ['dinero', 'decimal'].includes(f.tipo)
            ? v.replace(/,/g, '')
            : v;
  }
  if (cat.slug === 'horarios') {
    delete body.jornada;
    body.bloques = JSON.parse(d.bloques ?? '[]');
  }
  return body;
}

export function bloquesDesdeJson(valor: string): BloqueHorario[] {
  try {
    const resultado = z.array(bloqueSchema).safeParse(JSON.parse(valor));
    return resultado.success ? resultado.data : [];
  } catch {
    return [];
  }
}
