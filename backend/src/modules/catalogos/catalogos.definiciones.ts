export type TipoCampo =
  | 'nit'
  | 'correo'
  | 'telefono'
  | 'nombre'
  | 'texto'
  | 'codigo'
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
  referencia?: 'departamentos' | 'empleados';
}
export interface Catalogo {
  slug: string;
  titulo: string;
  tabla: string;
  pk: string;
  campos: CampoCatalogo[];
  legal?: boolean;
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
  campo(
    'nombre',
    'NOMBRE',
    'Nombre',
    'texto',
    'Nombre descriptivo que aparecerá en los formularios y listados.',
    { requerido: true, max },
  );
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
        'representante',
        'REPRESENTANTE',
        'Representante',
        'nombre',
        'Nombre completo de quien firma las constancias; no se agrega firma electrónica.',
        { requerido: true, max: 200 },
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
    titulo: 'Bancos',
    tabla: 'BANCOS',
    pk: 'ID_BANCO',
    campos: [codigo(), nombre(), descripcion],
  },
  {
    slug: 'centros-trabajo',
    titulo: 'Centros de trabajo',
    tabla: 'CENTROS_TRABAJO',
    pk: 'ID_CENTRO_TRABAJO',
    campos: [
      codigo(),
      nombre(),
      descripcion,
      campo(
        'localidad',
        'LOCALIDAD',
        'Localidad',
        'texto',
        'Localidad real para aplicar feriados locales.',
        { requerido: true, max: 120 },
      ),
      campo('direccion', 'DIRECCION', 'Dirección', 'area', 'Ubicación del centro de trabajo.', {
        max: 500,
      }),
    ],
  },
  {
    slug: 'departamentos',
    titulo: 'Departamentos',
    tabla: 'DEPARTAMENTOS',
    pk: 'ID_DEPARTAMENTO',
    campos: [codigo(), nombre(), descripcion],
  },
  {
    slug: 'puestos',
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
        'Jornada del patrón semanal; configura cada día por separado.',
        { requerido: true, opciones: ['DIURNA', 'MIXTA', 'NOCTURNA'] },
      ),
      descripcion,
    ],
  },
  {
    slug: 'feriados',
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
      descripcion,
    ],
  },
  {
    slug: 'tipos-descuento',
    titulo: 'Tipos de descuento',
    tabla: 'TIPOS_DESCUENTO',
    pk: 'ID_TIPO_DESCUENTO',
    campos: [codigo(), nombre(), descripcion],
  },
  {
    slug: 'tipos-contrato',
    titulo: 'Tipos de contrato',
    tabla: 'TIPOS_CONTRATO',
    pk: 'ID_TIPO_CONTRATO',
    campos: [
      codigo(),
      nombre(),
      campo(
        'requiereFin',
        'REQUIERE_FIN',
        'Requiere fecha de fin',
        'booleano',
        'Actívalo para contratos que deben tener fecha de finalización.',
        { requerido: true },
      ),
      descripcion,
    ],
  },
  {
    slug: 'parametros-legales',
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
        'Porcentajes en escala 0–100, montos o cantidades según la unidad. Hasta seis decimales.',
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
export type DatosCatalogo = Record<string, string | number | boolean | null | DiaHorario[]>;
export type FilaCatalogo = DatosCatalogo & { id: number; activo: boolean; enUso: boolean };
