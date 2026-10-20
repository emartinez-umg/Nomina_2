import { hintNombreCatalogo } from '../../shared/catalogos/nombre.js';
import { hintCodigoPostal, hintCodigoIso } from '../../shared/catalogos/formatos.js';
import type { BloqueHorario } from '../../shared/horarios/modelo.js';
export type TipoCampo =
  | 'nit'
  | 'correo'
  | 'telefono'
  | 'nombre'
  | 'texto'
  | 'codigo'
  | 'codigo-postal'
  | 'codigo-iso'
  | 'area'
  | 'dinero'
  | 'decimal'
  | 'entero'
  | 'fecha'
  | 'opcion'
  | 'referencia'
  | 'booleano';
export interface CampoCatalogo {
  nombre: string;
  columna: string;
  etiqueta: string;
  tipo: TipoCampo;
  hint: string;
  requerido?: boolean;
  max?: number;
  decimales?: number;
  opciones?: string[];
  referencia?: 'departamentos' | 'empleados' | 'departamentos-gt' | 'municipios-gt';
}
export interface Catalogo {
  slug: string;
  titulo: string;
  tabla: string;
  pk: string;
  campos: CampoCatalogo[];
  legal?: boolean;
  singular?: string;
}
const campo = (
  nombre: string,
  columna: string,
  etiqueta: string,
  tipo: TipoCampo,
  hint: string,
  extra: Partial<CampoCatalogo> = {},
): CampoCatalogo => ({ nombre, columna, etiqueta, tipo, hint, ...extra });
const codigo = (max = 40) =>
  campo(
    'codigo',
    'CODIGO',
    'Código',
    'codigo',
    'Se genera automáticamente a partir del nombre. La vista previa puede cambiar al guardar; después será permanente.',
    { requerido: true, max },
  );
const nombre = (max = 120) =>
  campo('nombre', 'NOMBRE', 'Nombre', 'texto', hintNombreCatalogo, { requerido: true, max });
const descripcion = campo(
  'descripcion',
  'DESCRIPCION',
  'Descripción',
  'area',
  'Explica el propósito del registro (opcional).',
  { max: 500 },
);
const departamento = campo(
  'idDepartamento',
  'ID_DEPARTAMENTO',
  'Departamento',
  'referencia',
  'Selecciona un departamento activo. Crea primero el departamento si no aparece.',
  { requerido: true, referencia: 'departamentos' },
);
const desde = campo(
  'vigenteDesde',
  'VIGENTE_DESDE',
  'Vigente desde',
  'fecha',
  'Primer día de aplicación. Una nueva versión debe comenzar después del último periodo cerrado.',
  { requerido: true },
);
const hasta = campo(
  'vigenteHasta',
  'VIGENTE_HASTA',
  'Vigente hasta',
  'fecha',
  'Último día inclusive. Déjalo vacío para una vigencia abierta.',
);
const fundamento = campo(
  'fundamento',
  'FUNDAMENTO',
  'Fundamento',
  'area',
  'Indica la norma o autorización que respalda el valor.',
  { requerido: true, max: 500 },
);
const dinero = (nombre: string, columna: string, etiqueta: string, requerido = true) =>
  campo(
    nombre,
    columna,
    etiqueta,
    'dinero',
    'Monto en quetzales, sin signo negativo y con hasta dos decimales.',
    { requerido, decimales: 2 },
  );
export const catalogos: Catalogo[] = [
  {
    slug: 'motivos-baja',
    singular: 'motivo de baja',
    titulo: 'Motivos de baja',
    tabla: 'MOTIVOS_BAJA',
    pk: 'ID_MOTIVO_BAJA',
    campos: [codigo(), nombre(50), descripcion],
  },
  {
    slug: 'zonas',
    singular: 'zona',
    titulo: 'Zonas',
    tabla: 'ZONAS',
    pk: 'ID_ZONA',
    campos: [
      codigo(),
      nombre(30),
      campo('codigoPostal', 'CODIGO_POSTAL', 'Código postal', 'codigo-postal', hintCodigoPostal, {
        requerido: true,
        max: 5,
      }),
      descripcion,
    ],
  },
  {
    slug: 'paises',
    singular: 'país',
    titulo: 'Países',
    tabla: 'PAISES',
    pk: 'ID_PAIS',
    campos: [
      codigo(),
      nombre(100),
      campo('codigoIso', 'CODIGO_ISO', 'Código ISO', 'codigo-iso', hintCodigoIso, {
        requerido: true,
        max: 2,
      }),
      descripcion,
    ],
  },
  {
    slug: 'empresa',
    titulo: 'Datos de empresa',
    tabla: 'CONFIGURACION_EMPRESA',
    pk: 'ID_CONFIGURACION_EMPRESA',
    campos: [
      campo(
        'nombre',
        'RAZON_SOCIAL',
        'Razón social',
        'texto',
        'Nombre legal de la empresa que aparecerá en boletas y constancias.',
        { requerido: true, max: 200 },
      ),
      campo(
        'nit',
        'NIT',
        'NIT de empresa',
        'nit',
        'NIT del RTU con verificador válido. Ejemplo: 1234567-9.',
        { requerido: true, max: 20 },
      ),
      campo(
        'direccion',
        'DIRECCION',
        'Dirección fiscal',
        'area',
        'Dirección completa de la empresa, hasta 500 caracteres.',
        { requerido: true, max: 500 },
      ),
      campo(
        'correo',
        'CORREO',
        'Correo de empresa',
        'correo',
        'Correo de contacto institucional. Ejemplo: rh@empresa.com.',
        { max: 254 },
      ),
      campo(
        'telefono',
        'TELEFONO',
        'Teléfono de empresa',
        'telefono',
        'Ocho dígitos, sin código de país.',
        { max: 8 },
      ),
    ],
  },
  {
    slug: 'bancos',
    singular: 'banco',
    titulo: 'Bancos',
    tabla: 'BANCOS',
    pk: 'ID_BANCO',
    campos: [codigo(), nombre(), descripcion],
  },
  {
    slug: 'centros-trabajo',
    singular: 'centro de trabajo',
    titulo: 'Centros de trabajo',
    tabla: 'CENTROS_TRABAJO',
    pk: 'ID_CENTRO_TRABAJO',
    campos: [
      codigo(),
      nombre(),
      descripcion,
      campo(
        'idDepartamentoGt',
        'ID_DEPARTAMENTO_GT',
        'Departamento de Guatemala',
        'referencia',
        'Departamento geográfico del catálogo oficial del INE. Busca por nombre; al cambiarlo vuelve a elegir el municipio.',
        { requerido: true, referencia: 'departamentos-gt' },
      ),
      campo(
        'idMunicipioGt',
        'ID_MUNICIPIO_GT',
        'Municipio',
        'referencia',
        'Busca y selecciona un municipio del departamento elegido. No se permite escribir una localidad libre.',
        { requerido: true, referencia: 'municipios-gt' },
      ),
      campo('direccion', 'DIRECCION', 'Dirección', 'area', 'Ubicación del centro de trabajo.', {
        max: 500,
      }),
    ],
  },
  {
    slug: 'departamentos',
    singular: 'departamento',
    titulo: 'Departamentos',
    tabla: 'DEPARTAMENTOS',
    pk: 'ID_DEPARTAMENTO',
    campos: [codigo(), nombre(), descripcion],
  },
  {
    slug: 'puestos',
    singular: 'puesto',
    titulo: 'Puestos',
    tabla: 'PUESTOS',
    pk: 'ID_PUESTO',
    campos: [
      codigo(),
      nombre(),
      departamento,
      dinero('salarioMinimo', 'SALARIO_MINIMO', 'Salario mínimo referencial', false),
      dinero('salarioMaximo', 'SALARIO_MAXIMO', 'Salario máximo referencial', false),
      descripcion,
    ],
  },
  {
    slug: 'jefaturas',
    singular: 'jefatura',
    titulo: 'Jefaturas',
    tabla: 'JEFATURAS',
    pk: 'ID_JEFATURA',
    campos: [
      codigo(),
      nombre(),
      departamento,
      campo(
        'idEmpleadoResponsable',
        'ID_EMPLEADO_RESPONSABLE',
        'Jefe responsable',
        'referencia',
        'Empleado activo del departamento. Puede asignarse después de registrar empleados en la fase 5.',
        { referencia: 'empleados' },
      ),
      descripcion,
    ],
  },
  {
    slug: 'horarios',
    singular: 'horario',
    titulo: 'Horarios laborales',
    tabla: 'HORARIOS',
    pk: 'ID_HORARIO',
    campos: [
      codigo(),
      nombre(),
      campo(
        'jornada',
        'JORNADA',
        'Tipo de jornada',
        'opcion',
        'Se calcula automáticamente a partir de las horas de los bloques.',
        { requerido: true, opciones: ['DIURNA', 'MIXTA', 'NOCTURNA'] },
      ),
      descripcion,
    ],
  },
  {
    slug: 'feriados',
    singular: 'feriado',
    titulo: 'Feriados',
    tabla: 'FERIADOS',
    pk: 'ID_FERIADO',
    campos: [
      codigo(60),
      nombre(),
      campo(
        'fecha',
        'FECHA',
        'Fecha de descanso',
        'fecha',
        'Fecha efectiva en el calendario anual.',
        { requerido: true },
      ),
      campo(
        'fechaConmemoracion',
        'FECHA_CONMEMORACION',
        'Fecha de conmemoración',
        'fecha',
        'Fecha nominal; puede diferir cuando el descanso se traslada.',
        { requerido: true },
      ),
      campo(
        'ambito',
        'AMBITO',
        'Ámbito',
        'opcion',
        'Nacional aplica a todo el país; local solo a la localidad indicada.',
        { requerido: true, opciones: ['NACIONAL', 'LOCAL'] },
      ),
      campo(
        'localidad',
        'LOCALIDAD',
        'Localidad',
        'texto',
        'Para nacional usa *. Para local indica la clave de localidad del centro de trabajo.',
        { requerido: true, max: 120 },
      ),
      campo(
        'minutoInicio',
        'MINUTO_INICIO',
        'Inicio de descanso (minutos)',
        'entero',
        'Minutos desde medianoche: 0 = 00:00; 720 = 12:00.',
        { requerido: true },
      ),
      campo(
        'minutoFin',
        'MINUTO_FIN',
        'Fin de descanso (minutos)',
        'entero',
        'Hasta 1440 = fin del día. Debe superar el inicio.',
        { requerido: true },
      ),
      fundamento,
    ],
  },
  {
    slug: 'tipos-ausencia',
    singular: 'tipo de ausencia',
    titulo: 'Tipos de ausencia',
    tabla: 'TIPOS_AUSENCIA',
    pk: 'ID_TIPO_AUSENCIA',
    campos: [
      codigo(),
      nombre(),
      campo(
        'efecto',
        'EFECTO',
        'Efecto en salario',
        'opcion',
        'Determina si conserva el salario, descuenta días o aplica subsidio IGSS.',
        { requerido: true, opciones: ['CON_GOCE', 'SIN_GOCE', 'SUBSIDIO_IGSS'] },
      ),
      campo(
        'categoriaInasistencia',
        'CATEGORIA_INASISTENCIA',
        'Categoría de inasistencia',
        'opcion',
        'Clasifica los días del dashboard: IGSS verde, con goce amarillo, sin goce naranja y sin justificación rojo. No cambia el efecto salarial. Si se omite, se conserva la categoría o se deriva del efecto al crear.',
        {
          opciones: [
            'IGSS_JUSTIFICADA',
            'JUSTIFICADA_CON_GOCE',
            'JUSTIFICADA_SIN_GOCE',
            'SIN_JUSTIFICAR',
          ],
        },
      ),
      descripcion,
    ],
  },
  {
    slug: 'tipos-descuento',
    singular: 'tipo de descuento',
    titulo: 'Tipos de descuento',
    tabla: 'TIPOS_DESCUENTO',
    pk: 'ID_TIPO_DESCUENTO',
    campos: [codigo(), nombre(), descripcion],
  },
  {
    slug: 'tipos-contrato',
    singular: 'tipo de contrato',
    titulo: 'Tipos de contrato',
    tabla: 'TIPOS_CONTRATO',
    pk: 'ID_TIPO_CONTRATO',
    campos: [
      codigo(),
      nombre(),
      campo(
        'requiereFin',
        'REQUIERE_FECHA_FIN',
        'Requiere fecha de fin',
        'booleano',
        'Actívalo para contratos que deben tener fecha de finalización.',
        { requerido: true },
      ),
      descripcion,
    ],
  },
  {
    slug: 'parentescos',
    titulo: 'Parentescos',
    singular: 'parentesco',
    tabla: 'PARENTESCOS',
    pk: 'ID_PARENTESCO',
    campos: [nombre(60)],
  },
  {
    slug: 'tipos-solicitud',
    titulo: 'Tipos de solicitud',
    singular: 'tipo de solicitud',
    tabla: 'TIPOS_SOLICITUD',
    pk: 'ID_TIPO_SOLICITUD',
    campos: [
      codigo(),
      nombre(),
      descripcion,
      campo(
        'generaPdf',
        'GENERA_PDF',
        'Genera PDF',
        'booleano',
        'Indica si el trámite requiere un documento y una plantilla.',
        { requerido: true },
      ),
      campo(
        'esDirecta',
        'ES_DIRECTA',
        'Consulta directa',
        'booleano',
        'Las consultas directas no crean un trámite en la bandeja.',
        { requerido: true },
      ),
    ],
  },
  {
    slug: 'tipos-deduccion-isr',
    titulo: 'Tipos de deducción ISR',
    singular: 'tipo de deducción ISR',
    tabla: 'TIPOS_DEDUCCION_ISR',
    pk: 'ID_TIPO_DEDUCCION_ISR',
    campos: [
      codigo(),
      nombre(),
      descripcion,
      campo(
        'codigoParametroTope',
        'CODIGO_PARAMETRO_TOPE',
        'Parámetro de tope',
        'texto',
        'Clave interna del parámetro vigente que limita la deducción; vacío si no hay tope.',
        { max: 60 },
      ),
    ],
  },
  {
    slug: 'conceptos',
    titulo: 'Conceptos de nómina',
    singular: 'concepto',
    tabla: 'CONCEPTOS_NOMINA',
    pk: 'ID_CONCEPTO_NOMINA',
    legal: true,
    campos: [
      codigo(),
      nombre(),
      campo(
        'naturaleza',
        'NATURALEZA',
        'Naturaleza',
        'opcion',
        'Clasifica el concepto para el cálculo de nómina.',
        { requerido: true, opciones: ['INGRESO', 'DESCUENTO', 'PATRONAL'] },
      ),
      ...[
        ['afectaIgss', 'AFECTA_IGSS', 'Afecta IGSS'],
        ['afectaIsr', 'AFECTA_ISR', 'Afecta ISR'],
        ['afectaPrestaciones', 'AFECTA_PRESTACIONES', 'Afecta prestaciones'],
      ].map(([n, c, e]) =>
        campo(
          n!,
          c!,
          e!,
          'booleano',
          'Determina la base de cálculo en la vigencia indicada. Revisa antes de confirmar.',
          { requerido: true },
        ),
      ),
      desde,
      hasta,
    ],
  },
  {
    slug: 'parametros-legales',
    singular: 'parámetro legal',
    titulo: 'Parámetros legales',
    tabla: 'PARAMETROS_LEGALES',
    pk: 'ID_PARAMETRO_LEGAL',
    legal: true,
    campos: [
      codigo(60),
      nombre(150),
      campo(
        'valor',
        'VALOR',
        'Valor',
        'decimal',
        'Porcentajes en escala 0–100, montos o cantidades según la unidad. Hasta seis decimales. VALIDAR_DIGITO_NIT: 0 desactiva, 1 activa, CANTIDAD; solo ADMIN.',
        { requerido: true, decimales: 6 },
      ),
      campo(
        'unidad',
        'UNIDAD',
        'Unidad',
        'opcion',
        'La unidad debe conservarse entre versiones del mismo código.',
        {
          requerido: true,
          opciones: [
            'PORCENTAJE',
            'QUETZALES',
            'DIAS',
            'HORAS',
            'MESES',
            'PERIODOS',
            'MINUTOS',
            'ANIOS',
            'CANTIDAD',
          ],
        },
      ),
      desde,
      hasta,
      fundamento,
    ],
  },
  {
    slug: 'tramos-isr',
    titulo: 'Tramos ISR',
    tabla: 'TRAMOS_ISR',
    pk: 'ID_TRAMO_ISR',
    legal: true,
    campos: [
      dinero('limiteInferior', 'LIMITE_INFERIOR', 'Límite inferior'),
      dinero('limiteSuperior', 'LIMITE_SUPERIOR', 'Límite superior', false),
      campo(
        'tasaPorcentaje',
        'TASA_PORCENTAJE',
        'Tasa (%)',
        'decimal',
        'Porcentaje entre 0 y 100 con hasta cuatro decimales.',
        { requerido: true, decimales: 4 },
      ),
      dinero('cuotaFija', 'CUOTA_FIJA', 'Cuota fija'),
      desde,
      hasta,
    ],
  },
];
export const obtenerCatalogo = (slug: string) => catalogos.find((c) => c.slug === slug);
export interface DiaHorario {
  diaSemana: number;
  laborable: boolean;
  entrada: string | null;
  salida: string | null;
  cruzaMedianoche: boolean;
  minutosDescanso: number;
}
export type DatosCatalogo = Record<
  string,
  string | number | boolean | null | DiaHorario[] | BloqueHorario[]
>;
export type FilaCatalogo = DatosCatalogo & {
  id: number;
  activo: boolean;
  enUso: boolean;
  usos: number;
};
