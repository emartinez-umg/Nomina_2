export interface Vigente {
  id: number;
  desde: string;
  hasta: string | null;
}
export interface Parametro extends Vigente {
  codigo: string;
  valor: string;
  unidad: string;
}
export interface Concepto extends Vigente {
  codigo: string;
  nombre: string;
  naturaleza: 'INGRESO' | 'DESCUENTO' | 'PATRONAL';
  igss: number;
  isr: number;
  prestaciones: number;
}
export interface Tramo extends Vigente {
  inferior: string;
  superior: string | null;
  tasa: string;
  fija: string;
}
export interface Salario extends Vigente {
  monto: string;
}
export interface Empleado {
  id: number;
  usuario: number | null;
  codigo: string;
  nombres: string;
  apellidos: string;
  ingreso: string;
  egreso: string | null;
  departamento: string;
  idDepartamento: number;
  puesto: string;
  centro: number;
  localidad: string;
  nit: string;
  afiliacion: string | null;
}
export interface Ausencia {
  id: number;
  inicio: string;
  fin: string;
  efecto: string;
  estado: string;
}
export interface Descuento {
  nombre?: string;
  id: number;
  cuota: number | null;
  codigo: string;
  modalidad: string;
  monto: string;
  saldo: string | null;
}
export interface Entrada {
  estimacionFiscal?: EstimacionFiscal;
  inicio: string;
  fin: string;
  empleado: Empleado;
  salarios: Salario[];
  parametros: Parametro[];
  conceptos: Concepto[];
  tramos: Tramo[];
  horarios: { desde: string; hasta: string | null; dias: number[] }[];
  jornadas?: { desde: string; hasta: string | null; dia: number; horas: string }[];
  feriados: string[];
  ausencias: Ausencia[];
  comisiones: { id: number; monto: string }[];
  horas: { id: number; fecha: string; horas: string; jornada: string | null; estado: string }[];
  descuentos: Descuento[];
  deducciones: { id: number; tipo: string; monto: string; tope: string | null }[];
  acumulado: { renta: string; igss: string; isr: string };
  prestaciones: { id: number; tipo: string; monto: string; exento?: string }[];
}
export interface Linea {
  novedad?: number;
  concepto: Concepto;
  descripcion: string;
  base: string;
  cantidad: string;
  tasa: string | null;
  monto: string;
  fecha: string;
  comision?: number;
  hora?: number;
  ausencia?: number;
  descuento?: Descuento;
}
export interface Resultado {
  estimacionFiscal?: EstimacionFiscal;
  dias: string;
  salario: string;
  idSalario: number;
  ingresos: string;
  descuentos: string;
  neto: string;
  patronal: string;
  baseIgss: string;
  lineas: Linea[];
  parametros: Parametro[];
  alertas: string[];
  isr: {
    anio: number;
    renta: string;
    personal: string;
    acreditadas: string;
    igss: string;
    imponible: string;
    anual: string;
    retenido: string;
    restantes: number;
    retencion: string;
    exceso: string;
    tramos: Tramo[];
    deducciones: unknown[];
    futuro: string;
  };
}
export type Estado = 'ABIERTO' | 'CALCULADO' | 'REVISADO' | 'APROBADO' | 'CERRADO';
export interface PeriodoFiscalEstimado {
  inicio: string;
  fin: string;
  renta: string;
  igss: string;
  isr: string;
  metodo: 'MENSUAL' | 'QUINCENAL';
}
export interface EstimacionFiscal {
  periodos: PeriodoFiscalEstimado[];
  renta: string;
  igss: string;
  isr: string;
}
export interface Periodo {
  motor?: string;
  id: number;
  inicio: string;
  fin: string;
  estado: Estado;
  version: number;
  hash: string | null;
  alertas: string;
  empleados: number;
  ingresos: string;
  descuentos: string;
  neto: string;
  patronal: string;
}
