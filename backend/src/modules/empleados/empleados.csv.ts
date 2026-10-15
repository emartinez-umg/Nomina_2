import { ErrorValidacion } from '../../shared/errors/errors.js';
import { crearEmpleadoCsvSchema } from './empleados.schemas.js';
export const columnasCsv = [
  'nombres',
  'apellidos',
  'dpi',
  'nit',
  'afiliacionIgss',
  'fechaNacimiento',
  'sexo',
  'estadoCivil',
  'idDepartamentoGt',
  'idMunicipioGt',
  'zona',
  'numeroCasa',
  'telefono',
  'correo',
  'idDepartamento',
  'idPuesto',
  'idJefatura',
  'idTipoContrato',
  'idCentroTrabajo',
  'codigoHorario',
  'fechaIngreso',
  'fechaFinContrato',
  'salarioBase',
  'idBanco',
  'cuentaBancaria',
  'tipoCuenta',
  'contactoNombre',
  'contactoParentesco',
  'contactoTelefono',
  'estado',
] as const;
export const celdaCsv = (v: unknown) =>
  `"${String(v ?? '')
    .replace(/^[\s]*[=+@-]/, "'$&")
    .replace(/"/g, '""')}"`;
export const escribirCsv = (filas: unknown[][]) =>
  '\uFEFF' + filas.map((f) => f.map(celdaCsv).join(',')).join('\r\n');
export function leerCsv(texto: string) {
  const filas: string[][] = [];
  let fila: string[] = [],
    celda = '',
    comillas = false,
    cerrada = false;
  const error = () => {
    throw new ErrorValidacion({
      csv: ['El CSV está mal formado. Usa comas y comillas dobles para textos con comas.'],
    });
  };
  texto = texto.replace(/^\uFEFF/, '');
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (ch === '"') {
      if (comillas && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (comillas) {
        comillas = false;
        cerrada = true;
      } else if (!celda && !cerrada) comillas = true;
      else error();
    } else if (!comillas && (ch === ',' || ch === '\n' || ch === '\r')) {
      fila.push(celda);
      celda = '';
      cerrada = false;
      if (ch !== ',') {
        if (fila.some((v) => v !== '')) filas.push(fila);
        fila = [];
        if (ch === '\r' && texto[i + 1] === '\n') i++;
      }
    } else {
      if (cerrada) error();
      celda += ch;
    }
  }
  if (comillas) error();
  fila.push(celda);
  if (fila.some((v) => v !== '')) filas.push(fila);
  const cabecera = filas.shift();
  if (!cabecera || cabecera.join(',') !== columnasCsv.join(','))
    throw new ErrorValidacion({
      csv: [
        'La cabecera no coincide con la plantilla. Descarga la plantilla actual y conserva sus columnas.',
      ],
    });
  if (filas.length < 1 || filas.length > 100)
    throw new ErrorValidacion({ csv: ['Incluye entre 1 y 100 empleados por archivo.'] });
  return filas.map((valores, i) => {
    const d: Record<string, unknown> = Object.fromEntries(
      columnasCsv.map((key, j) => [key, valores[j] ?? '']),
    );
    for (const key of columnasCsv) {
      if (key.startsWith('id') || key === 'zona') d[key] = d[key] === '' ? null : Number(d[key]);
      if (
        ['afiliacionIgss', 'fechaFinContrato', 'cuentaBancaria', 'tipoCuenta'].includes(key) &&
        d[key] === ''
      )
        d[key] = null;
    }
    const p = crearEmpleadoCsvSchema.safeParse(d);
    const errores: Record<string, string[]> =
      valores.length !== columnasCsv.length
        ? { csv: ['El número de columnas no coincide con la plantilla.'] }
        : {};
    if (!p.success)
      for (const issue of p.error.issues)
        (errores[issue.path.join('.')] ??= []).push(issue.message);
    return { numero: i + 2, datos: p.success ? p.data : d, errores };
  });
}
// Solo la descarga de ejemplo contiene datos ilustrativos; nunca se insertan automáticamente.
export const plantillaCsv = () =>
  escribirCsv([
    Array.from(columnasCsv),
    [
      'Ana',
      'Lopez',
      '1234567890123',
      '1234567-9',
      '',
      '1995-05-15',
      'F',
      'SOLTERO',
      '1',
      '1',
      '1',
      '12-A',
      '55551234',
      'empleado@empresa.com',
      '1',
      '1',
      '',
      '1',
      '1',
      'LAV',
      '2026-10-15',
      '',
      '5000.00',
      '',
      '',
      '',
      'Contacto de emergencia',
      'Hermano/a',
      '55554321',
      'ACTIVO',
    ],
  ]);
