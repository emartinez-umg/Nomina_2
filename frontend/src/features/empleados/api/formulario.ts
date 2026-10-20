import {
  direccionValida,
  mensajeDireccion,
  formatoNitValido,
  mensajeNit,
  digitoNitValido,
  grupoParcial,
  camposSalariales,
  camposContacto,
} from '../../../../../backend/src/shared/empleados/validadores';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  dpiSchema,
  telefonoSchema,
  correoSchema,
  fechaSchema,
  validarNacimiento,
  validarIngreso,
  fechaValida,
  hoyGuatemala,
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
}
export const secciones: {
  titulo: string;
  icono: 'usuario' | 'empleados' | 'planilla' | 'correo';
  opcional?: boolean;
  campos: CampoEmpleado[];
}[] = [
  {
    titulo: 'Datos personales',
    icono: 'usuario',
    campos: [
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
      },
      {
        nombre: 'nit',
        label: 'NIT',
        tipo: 'nit',
        hint: mensajeNit,
        required: true,
      },
      {
        nombre: 'afiliacionIgss',
        label: 'Afiliación IGSS',
        tipo: 'numero',
        hint: 'Número de afiliación personal, hasta 20 dígitos (opcional).',
        max: 20,
      },
      {
        nombre: 'fechaNacimiento',
        label: 'Fecha de nacimiento',
        tipo: 'fecha',
        hint: 'dd/mm/aaaa. Respeta la edad mínima y máxima configuradas.',
        required: true,
      },
      {
        nombre: 'sexo',
        label: 'Sexo',
        tipo: 'opcion',
        hint: 'Selecciona el dato del expediente.',
        opciones: ['F', 'M'],
        required: true,
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
        nombre: 'idDepartamentoGt',
        label: 'Departamento de Guatemala',
        tipo: 'referencia',
        hint: 'Departamento geográfico del catálogo oficial del INE.',
        required: true,
      },
      {
        nombre: 'idMunicipioGt',
        label: 'Municipio',
        tipo: 'referencia',
        hint: 'Municipio del departamento elegido.',
        required: true,
      },
      {
        nombre: 'zona',
        label: 'Zona',
        tipo: 'texto',
        hint: 'Del 1 al 25. Obligatoria en Guatemala.',
      },
      {
        nombre: 'direccion',
        label: 'Dirección',
        tipo: 'texto',
        hint: mensajeDireccion,
        max: 100,
        required: true,
      },
      {
        nombre: 'telefono',
        label: 'Teléfono',
        tipo: 'telefono',
        hint: '8 dígitos, sin código de país.',
        required: true,
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
    icono: 'empleados',
    campos: [
      {
        nombre: 'codigo',
        label: 'Código',
        tipo: 'texto',
        hint: 'Código automático: EMP, código de departamento y contador. Se conserva al trasladar al empleado.',
        max: 40,
        required: true,
      },

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
      },
      {
        nombre: 'fechaFinContrato',
        label: 'Fin de contrato',
        tipo: 'fecha',
        hint: 'Obligatoria y posterior al ingreso cuando el contrato tiene plazo. El contrato indefinido la mantiene vacía.',
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
    titulo: 'Datos salariales y banco',
    icono: 'planilla',
    opcional: true,
    campos: [
      {
        nombre: 'salarioBase',
        label: 'Salario base mensual',
        tipo: 'dinero',
        hint: 'Salario mensual en quetzales, mayor a cero. Los cambios posteriores se registran en la ficha.',
      },

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
  {
    titulo: 'Contacto de emergencia',
    icono: 'correo',
    opcional: true,
    campos: [
      {
        nombre: 'contactoNombre',
        label: 'Nombre del contacto',
        tipo: 'nombre',
        hint: 'Nombre completo de la persona a contactar.',
        max: 200,
      },
      {
        nombre: 'contactoParentesco',
        label: 'Parentesco',
        tipo: 'texto',
        hint: 'Selecciona la relación del contacto desde el catálogo. Ejemplo: Hermano/a.',
        max: 60,
      },
      {
        nombre: 'contactoTelefono',
        label: 'Teléfono de emergencia',
        tipo: 'telefono',
        hint: '8 dígitos, sin código de país.',
      },
    ],
  },
];
export const todosCampos = secciones.flatMap((s) => s.campos);
export function iniciales(d?: Empleado, hoy = hoyGuatemala()): Record<string, string> {
  return {
    ...Object.fromEntries(
      todosCampos.map((f) => [f.nombre, d?.[f.nombre] == null ? '' : String(d[f.nombre])]),
    ),
    estado: d?.estado ?? 'ACTIVO',
    fechaIngreso: String(d?.fechaIngreso ?? hoy),
    motivo: '',
    fechaHorario: '',
  };
}
export function schemaFormulario(
  r: Reglas,
  editar = false,
  requiereFin?: boolean,
  codigoMunicipio?: string,
  parentescos?: string[],
  paso?: number,
) {
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
    if (f.tipo === 'nit')
      schema = z
        .string()
        .refine(formatoNitValido, mensajeNit)
        .refine(
          (v) => !r.validarDigitoNit || digitoNitValido(v),
          'El dígito verificador del NIT no coincide. Revisa el número.',
        );
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
  if (parentescos)
    shape.contactoParentesco = z
      .string()
      .refine((v) => !v || parentescos.includes(v), 'Selecciona un parentesco del catálogo.');
  shape.codigo = z.string().default('');
  shape.cuentaBancaria = z.string().regex(/^[A-Za-z0-9-]{0,34}$/, 'Usa letras, números o guiones.');
  shape.zona = z
    .string()
    .refine(
      (v) => v === '' || /^(?:[1-9]|1\d|2[0-5])$/.test(v),
      'Selecciona una zona del 1 al 25.',
    );
  shape.direccion = z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC'))
    .refine(direccionValida, mensajeDireccion);
  shape.motivo = editar
    ? z.string().trim().min(5, 'Explica el motivo con al menos 5 caracteres.').max(500)
    : z.string();
  shape.fechaHorario = z.union([z.literal(''), fechaSchema]);
  const permitidos = paso === undefined ? null : camposPaso(paso, editar);
  if (permitidos)
    for (const key of Object.keys(shape)) if (!permitidos.includes(key)) shape[key] = z.any();
  return z.object(shape).superRefine((d, ctx) => {
    const add = (path: string, mensaje: string | undefined) => {
      if (mensaje && (!permitidos || permitidos.includes(path)))
        ctx.addIssue({ code: 'custom', path: [path], message: mensaje });
    };
    if (fechaValida(d.fechaNacimiento))
      add(
        'fechaNacimiento',
        validarNacimiento(d.fechaNacimiento, r.hoy, r.edadMinima, r.edadMaxima),
      );
    if (fechaValida(d.fechaIngreso) && fechaValida(d.fechaNacimiento))
      add('fechaIngreso', validarIngreso(d.fechaIngreso, d.fechaNacimiento, r.hoy, r.edadMinima));
    if (d.fechaFinContrato && d.fechaFinContrato <= d.fechaIngreso)
      add('fechaFinContrato', 'El fin de contrato debe ser posterior al ingreso.');
    if (requiereFin === true && !d.fechaFinContrato)
      add('fechaFinContrato', 'Este contrato exige una fecha de fin posterior al ingreso.');
    if (requiereFin === false && d.fechaFinContrato)
      add('fechaFinContrato', 'El contrato indefinido no tiene fecha de fin.');
    if (codigoMunicipio === '0101' && !d.zona)
      add('zona', 'Selecciona una zona del 1 al 25 para el municipio de Guatemala.');
    for (const campos of [camposSalariales, camposContacto]) {
      if (grupoParcial(d, campos))
        for (const key of campos)
          if (!d[key]) add(key, 'Completa este grupo opcional o déjalo completamente vacío.');
    }
  });
}
export function cuerpo(d: Record<string, string>, editar = false, salarioExistente = true) {
  const result: Record<string, unknown> = {};
  for (const f of todosCampos) {
    if (f.nombre === 'codigo') continue;
    if (editar && salarioExistente && f.nombre === 'salarioBase') continue;
    const v = d[f.nombre] ?? '';
    result[f.nombre] =
      v === ''
        ? null
        : f.tipo === 'referencia' || f.nombre === 'zona'
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
  }
  return result;
}

export function camposPaso(paso: number, editar = false) {
  return [
    ...(secciones[paso]?.campos.map((f) => f.nombre) ?? []),
    ...(paso === 1 && editar ? ['fechaHorario'] : []),
  ];
}
export function omisionesOpcionales(d: Record<string, string>) {
  return [
    ...(!d.salarioBase
      ? [
          'Sin salario: perfil incompleto; se excluye de la simulación y aparece en alertas del dashboard.',
        ]
      : []),
    ...(!d.idBanco
      ? ['Sin datos bancarios: no hay cuenta registrada para depositar el pago.']
      : []),
    ...(!d.contactoNombre
      ? ['Sin contacto de emergencia: no habrá una persona registrada a quien avisar.']
      : []),
  ];
}
