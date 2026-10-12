import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  dpiSchema,
  nitSchema,
  telefonoSchema,
  correoSchema,
  fechaSchema,
  validarNacimiento,
  validarIngreso,
  fechaValida,
} from '../../../lib/validadores';
import type { Empleado, Reglas } from './empleados';
export interface CampoEmpleado {
  nombre: string;
  label: string;
  tipo:
    | 'texto'
    | 'nombre'
    | 'dpi'
    | 'nit'
    | 'telefono'
    | 'correo'
    | 'fecha'
    | 'numero'
    | 'dinero'
    | 'area'
    | 'referencia'
    | 'opcion';
  hint: string;
  max?: number;
  required?: boolean;
  opciones?: string[];
  ancho?: 'corto' | 'medio' | 'ancho';
}
export const secciones: { titulo: string; campos: CampoEmpleado[] }[] = [
  {
    titulo: 'Datos personales',
    campos: [
      {
        nombre: 'codigo',
        label: 'Código',
        tipo: 'texto',
        hint: 'Código único en mayúsculas, números y guion. Ejemplo: EMP_001.',
        max: 40,
        required: true,
        ancho: 'corto',
      },
      {
        nombre: 'nombres',
        label: 'Nombres',
        tipo: 'nombre',
        hint: 'Nombres como aparecen en el DPI.',
        max: 100,
        required: true,
      },
      {
        nombre: 'apellidos',
        label: 'Apellidos',
        tipo: 'nombre',
        hint: 'Apellidos como aparecen en el DPI.',
        max: 100,
        required: true,
      },
      {
        nombre: 'dpi',
        label: 'DPI',
        tipo: 'dpi',
        hint: '13 dígitos del Documento Personal de Identificación.',
        required: true,
        ancho: 'corto',
      },
      {
        nombre: 'nit',
        label: 'NIT',
        tipo: 'nit',
        hint: 'Número de RTU con dígito verificador. Ejemplo: 1234567-9.',
        required: true,
        ancho: 'corto',
      },
      {
        nombre: 'afiliacionIgss',
        label: 'Afiliación IGSS',
        tipo: 'numero',
        hint: 'Número de afiliación personal, hasta 20 dígitos (opcional).',
        max: 20,
        ancho: 'corto',
      },
      {
        nombre: 'fechaNacimiento',
        label: 'Fecha de nacimiento',
        tipo: 'fecha',
        hint: 'dd/mm/aaaa. Respeta la edad mínima y máxima configuradas.',
        required: true,
        ancho: 'corto',
      },
      {
        nombre: 'sexo',
        label: 'Sexo',
        tipo: 'opcion',
        hint: 'Selecciona el dato del expediente.',
        opciones: ['F', 'M', 'O'],
        required: true,
        ancho: 'corto',
      },
      {
        nombre: 'estadoCivil',
        label: 'Estado civil',
        tipo: 'opcion',
        hint: 'Selecciona el estado civil actual.',
        opciones: ['SOLTERO', 'CASADO', 'UNIDO', 'DIVORCIADO', 'VIUDO'],
        required: true,
      },
      {
        nombre: 'direccion',
        label: 'Dirección',
        tipo: 'area',
        hint: 'Dirección completa de residencia, hasta 500 caracteres.',
        max: 500,
        required: true,
        ancho: 'ancho',
      },
      {
        nombre: 'telefono',
        label: 'Teléfono',
        tipo: 'telefono',
        hint: '8 dígitos, sin código de país.',
        required: true,
        ancho: 'corto',
      },
      {
        nombre: 'correo',
        label: 'Correo',
        tipo: 'correo',
        hint: 'Correo único. Ejemplo: nombre@empresa.com.',
        required: true,
      },
    ],
  },
  {
    titulo: 'Datos laborales',
    campos: [
      ...[
        ['idDepartamento', 'Departamento'],
        ['idPuesto', 'Puesto'],
        ['idJefatura', 'Jefatura'],
        ['idTipoContrato', 'Tipo de contrato'],
        ['idCentroTrabajo', 'Centro de trabajo'],
        ['idHorario', 'Horario'],
      ].map(([nombre, label]) => ({
        nombre: nombre!,
        label: label!,
        tipo: 'referencia' as const,
        hint: 'Busca y selecciona un registro activo. Administra las opciones desde Catálogos.',
        required: nombre !== 'idJefatura',
      })),
      {
        nombre: 'fechaIngreso',
        label: 'Fecha de ingreso',
        tipo: 'fecha',
        hint: 'Desde la edad mínima y hasta 30 días en el futuro. Se conserva tras el alta.',
        required: true,
        ancho: 'corto',
      },
      {
        nombre: 'fechaFinContrato',
        label: 'Fin de contrato',
        tipo: 'fecha',
        hint: 'Opcional. Igual o posterior al ingreso.',
        ancho: 'corto',
      },
      {
        nombre: 'estado',
        label: 'Estado',
        tipo: 'opcion',
        hint: 'Para terminar la relación laboral utiliza Dar de baja en la ficha.',
        opciones: ['ACTIVO', 'SUSPENDIDO'],
        required: true,
      },
    ],
  },
  {
    titulo: 'Datos salariales',
    campos: [
      {
        nombre: 'salarioBase',
        label: 'Salario base mensual',
        tipo: 'dinero',
        hint: 'Salario mensual en quetzales, mayor a cero. Los cambios posteriores se registran en la ficha.',
        required: true,
        ancho: 'corto',
      },
    ],
  },
  {
    titulo: 'Contacto de emergencia',
    campos: [
      {
        nombre: 'contactoNombre',
        label: 'Nombre del contacto',
        tipo: 'nombre',
        hint: 'Nombre completo de la persona a contactar.',
        max: 200,
        required: true,
      },
      {
        nombre: 'contactoParentesco',
        label: 'Parentesco',
        tipo: 'texto',
        hint: 'Relación con el empleado. Ejemplo: Hermana.',
        max: 60,
        required: true,
      },
      {
        nombre: 'contactoTelefono',
        label: 'Teléfono de emergencia',
        tipo: 'telefono',
        hint: '8 dígitos, sin código de país.',
        required: true,
        ancho: 'corto',
      },
    ],
  },
  {
    titulo: 'Banco',
    campos: [
      {
        nombre: 'idBanco',
        label: 'Banco',
        tipo: 'referencia',
        hint: 'Opcional. Si seleccionas banco debes completar cuenta y tipo.',
      },
      {
        nombre: 'cuentaBancaria',
        label: 'Cuenta bancaria',
        tipo: 'texto',
        hint: 'Hasta 34 letras, números o guiones, sin espacios.',
        max: 34,
      },
      {
        nombre: 'tipoCuenta',
        label: 'Tipo de cuenta',
        tipo: 'opcion',
        hint: 'Selecciona el tipo que corresponde a la cuenta.',
        opciones: ['AHORRO', 'MONETARIA'],
      },
    ],
  },
];
export const todosCampos = secciones.flatMap((s) => s.campos);
export function iniciales(d?: Empleado): Record<string, string> {
  return {
    ...Object.fromEntries(
      todosCampos.map((f) => [f.nombre, d?.[f.nombre] == null ? '' : String(d[f.nombre])]),
    ),
    estado: d?.estado ?? 'ACTIVO',
    generarUsuario: 'false',
    motivo: '',
    fechaHorario: '',
  };
}
export function schemaFormulario(r: Reglas, editar = false) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of todosCampos) {
    let schema: z.ZodTypeAny = z
      .string()
      .trim()
      .max(f.max ?? 500);
    if (f.tipo === 'nombre')
      schema = z
        .string()
        .trim()
        .max(f.max ?? 100)
        .regex(/^[\p{L}\p{M} '-]+$/u, 'Usa letras y espacios.');
    if (f.tipo === 'dpi') schema = dpiSchema;
    if (f.tipo === 'nit') schema = nitSchema;
    if (f.tipo === 'telefono') schema = telefonoSchema;
    if (f.tipo === 'correo') schema = correoSchema;
    if (f.tipo === 'fecha') schema = fechaSchema;
    if (f.tipo === 'referencia')
      schema = z.string().regex(/^[1-9]\d*$/, 'Selecciona un registro de la lista.');
    if (f.tipo === 'numero') schema = z.string().regex(/^\d{1,20}$/, 'Usa hasta 20 dígitos.');
    if (f.tipo === 'dinero')
      schema = z
        .string()
        .transform((v) => v.replace(/,/g, ''))
        .pipe(
          z
            .string()
            .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Usa un monto con hasta 2 decimales.')
            .refine(
              (v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && new Decimal(v).gt(0),
              'El salario debe ser mayor a cero.',
            ),
        );
    if (f.tipo === 'opcion')
      schema = z.string().refine((v) => f.opciones?.includes(v), 'Selecciona una opción válida.');
    if (!f.required || (editar && f.nombre === 'salarioBase'))
      schema = z.union([z.literal(''), schema]);
    else schema = z.string().min(1, 'Completa este campo obligatorio.').pipe(schema);
    shape[f.nombre] = schema;
  }
  shape.codigo = z
    .string()
    .regex(/^[A-Z0-9_-]{1,40}$/, 'Usa mayúsculas, números, guion o guion bajo.');
  shape.cuentaBancaria = z.string().regex(/^[A-Za-z0-9-]{0,34}$/, 'Usa letras, números o guiones.');
  shape.generarUsuario = z.enum(['true', 'false']);
  shape.motivo = editar
    ? z.string().trim().min(5, 'Explica el motivo con al menos 5 caracteres.').max(500)
    : z.string();
  shape.fechaHorario = z.union([z.literal(''), fechaSchema]);
  return z.object(shape).superRefine((d, ctx) => {
    const add = (path: string, mensaje: string | undefined) => {
      if (mensaje) ctx.addIssue({ code: 'custom', path: [path], message: mensaje });
    };
    if (fechaValida(d.fechaNacimiento))
      add(
        'fechaNacimiento',
        validarNacimiento(d.fechaNacimiento, r.hoy, r.edadMinima, r.edadMaxima),
      );
    if (fechaValida(d.fechaIngreso) && fechaValida(d.fechaNacimiento))
      add('fechaIngreso', validarIngreso(d.fechaIngreso, d.fechaNacimiento, r.hoy, r.edadMinima));
    if (d.fechaFinContrato && d.fechaFinContrato < d.fechaIngreso)
      add('fechaFinContrato', 'El fin de contrato no puede ser anterior al ingreso.');
    const presentes = [d.idBanco, d.cuentaBancaria, d.tipoCuenta].filter(Boolean).length;
    if (presentes && presentes !== 3)
      add('cuentaBancaria', 'Completa banco, cuenta y tipo, o deja los tres vacíos.');
  });
}
export function cuerpo(d: Record<string, string>, editar = false) {
  const result: Record<string, unknown> = {};
  for (const f of todosCampos) {
    if (editar && f.nombre === 'salarioBase') continue;
    const v = d[f.nombre] ?? '';
    result[f.nombre] =
      v === ''
        ? null
        : f.tipo === 'referencia'
          ? Number(v)
          : f.tipo === 'dpi' || f.tipo === 'telefono'
            ? v.replace(/\s/g, '')
            : f.tipo === 'correo'
              ? v.trim().toLowerCase()
              : f.tipo === 'dinero'
                ? v.replace(/,/g, '')
                : v;
  }
  if (editar) {
    result.motivo = d.motivo;
    if (d.fechaHorario) result.fechaHorario = d.fechaHorario;
  } else result.generarUsuario = d.generarUsuario === 'true';
  return result;
}
