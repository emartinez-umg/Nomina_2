import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  crearEmpleadoSchema,
  dinero,
  fecha,
  erroresFechas,
  nitValido,
} from '../../../modules/empleados/empleados.schemas.js';
import type {
  DatosEmpleado,
  ReglasEmpleado,
} from '../../../modules/empleados/empleados.schemas.js';
import { bloqueSchema, entradaSchema } from '../../../modules/catalogos/catalogos.schemas.js';
import { catalogos } from '../../../modules/catalogos/catalogos.definiciones.js';
import { analizarHorario } from '../../horarios/modelo.js';
import type { LimitesHorario } from '../../horarios/modelo.js';
import { zonaValida } from '../../../modules/ubicaciones/ubicaciones.schemas.js';

const texto = z.string().trim().min(1);
const catalogo = z.object({ clave: texto, nombre: texto, descripcion: texto.optional() });
const historial = z.object({ salarioBase: dinero, vigenteDesde: fecha, motivo: texto });
const prestamo = z.object({
  tipoDescuento: z.enum(['PRESTAMO', 'ANTICIPO']),
  monto: dinero,
  cuotas: z.number().int().min(1).max(600),
  fechaInicio: fecha,
  fechaDesembolso: fecha,
  referencia: texto,
  motivo: texto,
});
const ausencia = z.object({
  tipoAusencia: texto,
  fechaInicio: fecha,
  fechaFin: fecha,
  estado: z.literal('APROBADA'),
  motivo: texto,
});
const comision = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  monto: dinero,
  referencia: texto,
  motivo: texto,
});
const empleado = z
  .object({
    clave: texto,
    nombres: texto,
    apellidos: texto,
    dpi: texto,
    nit: texto,
    afiliacionIgss: texto,
    sexo: z.enum(['M', 'F']),
    fechaNacimiento: fecha,
    estadoCivil: z.enum(['SOLTERO', 'CASADO', 'UNIDO', 'DIVORCIADO', 'VIUDO']),
    departamentoGt: texto,
    municipioGt: texto,
    zona: z.number().int().nullable(),
    direccion: texto,
    telefono: texto,
    correo: texto,
    departamento: texto,
    puesto: texto,
    centroTrabajo: texto,
    horario: texto,
    jefatura: z.null(),
    tipoContrato: texto,
    fechaIngreso: fecha,
    fechaFinContrato: fecha.nullable(),
    salarioBase: dinero,
    banco: texto,
    cuentaBancaria: texto,
    tipoCuenta: z.enum(['AHORRO', 'MONETARIA']),
    contactoNombre: texto,
    contactoParentesco: texto,
    contactoTelefono: texto,
    rol: z.enum(['RH', 'EMPLEADO']),
    estado: z.literal('ACTIVO'),
    extras: z
      .object({
        historialSalarial: z.array(historial).min(2).optional(),
        parqueo: z
          .object({
            vehiculo: z.enum(['CARRO', 'MOTO']),
            placa: texto,
            mesInicio: texto,
            motivo: texto,
          })
          .optional(),
        prestamo: prestamo.optional(),
        anticipo: prestamo.optional(),
        ausencias: z.array(ausencia).optional(),
        comisiones: z.array(comision).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const configuracion = z
  .object({
    conjunto: z.literal('nomina2-demo-v1'),
    version: z.literal(1),
    fechaReferencia: fecha,
    zonaHoraria: z.literal('America/Guatemala'),
    salarioMinimoDemo: z.object({
      claveInterna: z.literal('SALARIO_MINIMO_MENSUAL'),
      nombre: texto,
      valor: dinero,
      unidad: z.literal('QUETZALES'),
      vigenteDesde: fecha,
      vigenteHasta: fecha.nullable(),
      fundamento: texto,
      motivo: texto,
    }),
    tarifasParqueoDemo: z.array(
      z.object({
        vehiculo: z.enum(['CARRO', 'MOTO']),
        monto: dinero,
        vigenteDesde: fecha,
        vigenteHasta: fecha.nullable(),
        motivo: texto,
      }),
    ),
    contratos: z.array(z.object({ clave: texto, nombre: texto, requiereFechaFin: z.boolean() })),
    tiposAusencia: z.array(z.object({ clave: texto, nombre: texto })),
    fuentes: z.record(z.unknown()),
    politicas: z.record(z.boolean()),
  })
  .strict();
export const datasetSchema = z.object({
  departamentos: z.array(catalogo.strict()).length(5),
  puestos: z
    .array(
      catalogo
        .extend({
          departamento: texto,
          salarioReferencia: dinero,
          salarioMinimo: dinero,
          salarioMaximo: dinero,
        })
        .strict(),
    )
    .length(30),
  centros: z
    .array(
      catalogo
        .extend({
          departamentoGt: texto,
          municipioGt: texto,
          direccion: texto,
          telefonoReferencia: z.string().regex(/^\d{8}$/),
        })
        .strict(),
    )
    .length(10),
  horarios: z
    .array(
      catalogo
        .extend({
          jornada: z.enum(['DIURNA', 'MIXTA', 'NOCTURNA']),
          bloques: z.array(bloqueSchema),
        })
        .strict(),
    )
    .min(7),
  bancos: z.array(catalogo.strict()).length(5),
  empleados: z.array(empleado).min(32),
  configuracion,
});
export type Dataset = z.infer<typeof datasetSchema>;
export type EmpleadoDemo = Dataset['empleados'][number];
export type Identificadores = {
  departamentoGt: number;
  municipioGt: number;
  departamento: number;
  puesto: number;
  centroTrabajo: number;
  horario: number;
  banco: number;
  tipoContrato: number;
};
export function datosEmpleado(e: EmpleadoDemo, ids: Identificadores): DatosEmpleado {
  const referencias = new Set([
    'clave',
    'departamentoGt',
    'municipioGt',
    'departamento',
    'puesto',
    'centroTrabajo',
    'horario',
    'banco',
    'tipoContrato',
    'jefatura',
    'rol',
    'extras',
  ]);
  const datos = Object.fromEntries(Object.entries(e).filter(([campo]) => !referencias.has(campo)));
  return crearEmpleadoSchema.parse({
    ...datos,
    idDepartamentoGt: ids.departamentoGt,
    idMunicipioGt: ids.municipioGt,
    idDepartamento: ids.departamento,
    idPuesto: ids.puesto,
    idCentroTrabajo: ids.centroTrabajo,
    idHorario: ids.horario,
    idBanco: ids.banco,
    idTipoContrato: ids.tipoContrato,
    idJefatura: null,
  });
}
export async function cargarDataset() {
  const nombres = [
    'departamentos',
    'puestos',
    'centros',
    'horarios',
    'bancos',
    'empleados',
    'configuracion',
  ];
  const valores = await Promise.all(
    nombres.map(async (nombre) => [
      nombre,
      JSON.parse(
        await readFile(
          fileURLToPath(
            new URL(`../../../../../database/seed/data/${nombre}.json`, import.meta.url),
          ),
          'utf8',
        ),
      ),
    ]),
  );
  return datasetSchema.parse(Object.fromEntries(valores));
}
export function exigir(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new Error(mensaje);
}
export function validarDataset(d: Dataset, reglas: ReglasEmpleado, limites: LimitesHorario) {
  const colecciones = [d.departamentos, d.puestos, d.centros, d.horarios, d.bancos, d.empleados];
  for (const filas of colecciones)
    exigir(
      new Set(filas.map((f) => f.clave)).size === filas.length,
      'El conjunto contiene claves duplicadas.',
    );
  const ids: Identificadores = {
    departamentoGt: 1,
    municipioGt: 1,
    departamento: 1,
    puesto: 1,
    centroTrabajo: 1,
    horario: 1,
    banco: 1,
    tipoContrato: 1,
  };
  for (const h of d.horarios) {
    const a = analizarHorario(h.bloques, limites);
    exigir(
      !a.errores.length && a.jornada === h.jornada,
      `Horario ${h.clave}: ${a.errores.join(' ') || 'jornada inconsistente'}`,
    );
  }
  for (const [slug, filas] of [
    ['departamentos', d.departamentos],
    ['bancos', d.bancos],
  ] as const) {
    const cat = catalogos.find((c) => c.slug === slug)!;
    for (const f of filas)
      entradaSchema(cat).parse({ nombre: f.nombre, descripcion: f.descripcion ?? null });
  }
  for (const campo of ['dpi', 'nit', 'afiliacionIgss', 'correo'] as const)
    exigir(
      new Set(d.empleados.map((e) => e[campo])).size === d.empleados.length,
      `Hay identificaciones demo duplicadas (${campo}).`,
    );
  for (const e of d.empleados) {
    datosEmpleado(e, ids);
    exigir(
      !Object.keys(erroresFechas(e, reglas)).length,
      `Fechas inválidas en ${e.clave}; revisa la fecha de referencia y la edad configurada.`,
    );
    exigir(
      nitValido(e.nit) && zonaValida(e.municipioGt, e.zona),
      `NIT o zona inválidos en ${e.clave}.`,
    );
    const puesto = d.puestos.find((p) => p.clave === e.puesto);
    const contrato = d.configuracion.contratos.find((c) => c.clave === e.tipoContrato);
    exigir(
      puesto?.departamento === e.departamento &&
        d.departamentos.some((r) => r.clave === e.departamento),
      `Departamento/puesto inválidos en ${e.clave}.`,
    );
    for (const [filas, clave] of [
      [d.centros, e.centroTrabajo],
      [d.horarios, e.horario],
      [d.bancos, e.banco],
    ] as const)
      exigir(
        filas.some((r) => r.clave === clave),
        `Referencia inválida en ${e.clave}.`,
      );
    exigir(
      contrato && contrato.requiereFechaFin === Boolean(e.fechaFinContrato),
      `Contrato inconsistente en ${e.clave}.`,
    );
    exigir(
      !e.fechaFinContrato || e.fechaFinContrato > reglas.hoy,
      `El contrato demo ${e.clave} ya venció; actualiza el dataset antes de cargarlo.`,
    );
    exigir(
      new Decimal(e.salarioBase).gte(new Decimal(puesto.salarioReferencia).mul('0.9')) &&
        new Decimal(e.salarioBase).lte(new Decimal(puesto.salarioReferencia).mul('1.1')),
      `Salario fuera del rango demo en ${e.clave}.`,
    );
    exigir(
      e.correo.endsWith('@demo-nomina.test'),
      `El correo de ${e.clave} no pertenece al conjunto demo.`,
    );
    if (e.extras?.historialSalarial) {
      const historia = e.extras.historialSalarial;
      exigir(
        historia[0]!.vigenteDesde === e.fechaIngreso &&
          historia.at(-1)!.salarioBase === e.salarioBase,
        `Historial salarial inconsistente en ${e.clave}.`,
      );
      for (const [i, cambio] of historia.entries())
        exigir(
          cambio.vigenteDesde <= reglas.hoy &&
            (!i || cambio.vigenteDesde > historia[i - 1]!.vigenteDesde),
          `Las vigencias salariales de ${e.clave} deben ser pasadas y estar ordenadas.`,
        );
    }
  }
  for (const p of d.puestos)
    exigir(
      d.empleados.some((e) => e.puesto === p.clave),
      `Puesto ${p.clave} sin empleado demo.`,
    );
}
