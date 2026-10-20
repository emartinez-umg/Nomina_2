import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import type { ActorAuditoria } from '../auth/auth.types.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { ErrorConflicto, ErrorNegocio } from '../../shared/errors/errors.js';
import { dinero } from '../../shared/utils/dinero.js';
import { calcularHoraExtra, diasInclusivos } from './novedades.reglas.js';
import type { Datos } from './novedades.schemas.js';
import { empleado, hoy, cerrados, parametrosHora } from './novedades.repository.js';
import * as repo from './mensuales.repository.js';
export function rangoMes(mes: string) {
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(mes))
    throw new ErrorConflicto('Selecciona un mes y año válidos.');
  const inicio = `${mes}-01`,
    date = new Date(`${inicio}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return { inicio, fin: date.toISOString().slice(0, 10) };
}
export function validarMes(mes: string, fechaHoy: string) {
  const rango = rangoMes(mes);
  if (mes > fechaHoy.slice(0, 7))
    throw new ErrorNegocio('El mes no puede ser futuro.', 422, 'VALIDACION', {
      mes: ['Selecciona el mes actual o uno anterior.'],
    });
  return rango;
}
export function calcularAusencia(salario: string, dias: number, sinGoce: boolean) {
  if (!new Decimal(salario).gte(0) || !Number.isInteger(dias) || dias < 0)
    throw new ErrorConflicto('Salario y días deben ser no negativos.');
  return dinero(sinGoce ? new Decimal(salario).div(30).mul(dias) : 0);
}
export function exigirEditable(estado: string, bloqueada: number, activo: number) {
  if (estado === 'APLICADA' || bloqueada || !activo)
    throw new ErrorConflicto(
      'La novedad está aplicada, anulada o afecta un periodo cerrado. Conserva su historial.',
    );
}
export async function valorarMes(
  c: Connection,
  d: { idEmpleado: number; mes: string; horas: string; id?: number },
) {
  const { fin } = validarMes(d.mes, await hoy(c)),
    e = await empleado(c, d.idEmpleado);
  const fecha = [fin, await hoy(c), e?.fin ?? fin].sort()[0]!;
  const corte = fecha;
  const p = await parametrosHora(c, d.idEmpleado, corte);
  if (!p.salario)
    throw new ErrorConflicto('Completa el salario vigente del empleado para este mes.');
  const vigentes = p.jornadas.filter((j) => j.desde <= corte && (!j.hasta || j.hasta >= corte));
  if (!vigentes.length || new Set(vigentes.map((j) => `${j.desde}:${j.hasta}`)).size !== 1)
    throw new ErrorConflicto('Completa un horario vigente único para valorar las horas del mes.');
  const jornada = vigentes.reduce((s, j) => s.plus(j.horas), new Decimal(0)).div(vigentes.length);
  const recargo = p.parametros.filter(
    (v) => v.CODIGO === 'HORAS_EXTRA_RECARGO_PORCENTAJE' && v.UNIDAD === 'PORCENTAJE',
  );
  if (recargo.length !== 1)
    throw new ErrorConflicto('Configura el recargo vigente de horas extra.');
  const calculo = calcularHoraExtra(
    p.salario,
    d.horas,
    '30',
    jornada.toString(),
    recargo[0]!.VALOR,
  );
  if (new Decimal(calculo.monto).gt('9999999999.99'))
    throw new ErrorNegocio(
      'El monto excede la capacidad monetaria del registro.',
      422,
      'VALIDACION',
      { horas: ['Reduce la cantidad de horas; el importe supera Q 9,999,999,999.99.'] },
    );
  const topes = await repo.topeHoras(c, corte);
  if (topes.length !== 1 || !new Decimal(topes[0]!.valor).gt(0))
    throw new ErrorConflicto(
      'Configura un único tope mensual positivo de horas extra (unidad HORAS).',
    );
  const total = new Decimal(await repo.horasMes(c, d.idEmpleado, d.mes, d.id ?? 0)).plus(d.horas);
  const advertencia = total.gt(topes[0]!.valor)
    ? `Las ${total.toString()} horas superan el tope mensual de ${topes[0]!.valor}. Verifica y confirma la cantidad antes de guardar.`
    : null;
  return {
    calculo,
    advertencia,
    horasJornada: jornada.toString(),
    valorUnitario: new Decimal(p.salario).div(30).div(jornada).toFixed(8),
  };
}
export async function validarMensual(c: Connection, d: Datos) {
  const fechaHoy = await hoy(c),
    r = validarMes(d.mes!, fechaHoy),
    e = await empleado(c, d.idEmpleado);
  if (
    !e ||
    e.estado !== 'ACTIVO' ||
    e.inicio > r.fin ||
    e.inicio > fechaHoy ||
    (e.fin && e.fin < r.inicio)
  )
    throw new ErrorConflicto('El mes debe corresponder a la relación laboral activa del empleado.');
  if (await cerrados(c, r.inicio, r.fin))
    throw new ErrorNegocio('El mes afecta un periodo cerrado.', 422, 'VALIDACION', {
      mes: ['Selecciona un mes sin periodos cerrados.'],
    });
}
export async function guardarMensual(
  c: Connection,
  a: ActorAuditoria,
  tipo: repo.TipoMensual,
  d: Datos,
  id?: number,
) {
  await validarMensual(c, d);
  if (await repo.referenciaRepetida(c, tipo, { ...d, mes: d.mes! }, id))
    throw new ErrorNegocio(
      'La referencia ya existe para este empleado, mes y tipo de novedad.',
      409,
      'CONFLICTO',
      {
        referencia: [
          'Revisa el respaldo: esta referencia ya fue cargada para el mismo empleado y mes.',
        ],
      },
    );
  const antes = id
    ? (
        await repo.listarMensuales(
          c,
          tipo,
          { pagina: 1, limite: 1, ordenarPor: 'id', direccion: 'desc' },
          id,
        )
      ).registros[0]
    : null;
  const v =
    tipo === 'horas-extra'
      ? await valorarMes(c, {
          idEmpleado: d.idEmpleado,
          mes: d.mes!,
          horas: d.horas!,
          ...(id ? { id } : {}),
        })
      : null;
  if (v?.advertencia && !d.confirmado) throw new ErrorConflicto(v.advertencia);
  const saved = await repo.guardarMensual(
    c,
    tipo,
    { ...d, mes: d.mes! },
    v?.calculo.monto ?? d.monto!,
    v?.valorUnitario ?? null,
    v?.calculo.recargo ?? null,
    a.idUsuario,
    id,
  );
  await registrarAuditoria(c, {
    actor: a,
    accion: id ? 'EDITAR_NOVEDAD' : 'CREAR_NOVEDAD',
    entidad: 'NOVEDADES_MENSUALES',
    idEntidad: saved,
    antes,
    despues: { ...d, ...v },
    motivo: d.motivo,
  });
  return saved;
}
export async function desglosarAusencia(
  c: Connection,
  d: { idEmpleado: number; fechaInicio: string; fechaFin: string; idTipo: number },
) {
  const tipos = await repo.filas<{ efecto: string }>(
    c,
    'SELECT EFECTO "efecto" FROM TIPOS_AUSENCIA WHERE ID_TIPO_AUSENCIA=:id',
    { id: d.idTipo },
  );
  const efecto = tipos[0]?.efecto;
  if (!efecto) throw new ErrorConflicto('Selecciona un tipo de ausencia válido.');
  const salarios = await repo.salariosEmpleado(c, d.idEmpleado);
  const meses = new Map<string, { dias: number; monto: Decimal }>();
  for (let fecha = d.fechaInicio; fecha <= d.fechaFin;) {
    const mes = fecha.slice(0, 7),
      r = rangoMes(mes),
      fin = r.fin < d.fechaFin ? r.fin : d.fechaFin;
    let monto = new Decimal(0);
    for (let dia = fecha; dia <= fin;) {
      const vigentes = salarios.filter((s) => s.desde <= dia && (!s.hasta || s.hasta >= dia));
      const salario = vigentes.length === 1 ? vigentes[0]!.salario : undefined;
      if (efecto === 'SIN_GOCE' && !salario)
        throw new ErrorConflicto('Completa el salario vigente para cada día de ausencia.');
      if (efecto === 'SIN_GOCE') monto = monto.plus(new Decimal(salario!).div(30));
      const sig = new Date(`${dia}T12:00:00Z`);
      sig.setUTCDate(sig.getUTCDate() + 1);
      dia = sig.toISOString().slice(0, 10);
    }
    meses.set(mes, { dias: diasInclusivos(fecha, fin), monto });
    const sig = new Date(`${fin}T12:00:00Z`);
    sig.setUTCDate(sig.getUTCDate() + 1);
    fecha = sig.toISOString().slice(0, 10);
  }
  return {
    efecto,
    descuento: dinero(
      [...meses.values()].reduce((s, m) => s.plus(dinero(m.monto)), new Decimal(0)),
    ),
    meses: [...meses].map(([mes, v]) => ({ mes, dias: v.dias, monto: dinero(v.monto) })),
  };
}
