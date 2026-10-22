import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { boletasPdf } from './nomina.exportar.js';
import { entradaPrueba } from './nomina.fixture.js';
import { calcularNomina } from './nomina.calculo.js';
import type { Guardado } from './nomina.repository.js';
import { empresaPrueba } from '../../shared/pdf/documento.fixture.js';
import { conTituloPdf } from '../../shared/pdf/titulo.js';
import {
  diasBoleta,
  identificadorBoleta,
  monedaBoleta,
  nombreBoleta,
  nombreLoteBoletas,
  tituloBoleta,
} from './boleta.pdf.js';

function boleta(tipo?: 'ANTICIPO' | 'PAGO') {
  const entrada = entradaPrueba('10000');
  entrada.empleado.nombres = 'María José';
  entrada.empleado.apellidos = 'López Pérez';
  entrada.empleado.codigo = 'EMP_ING_0001';
  const resultado = calcularNomina(entrada);
  if (tipo) Object.assign(resultado, { tipoPago: tipo, mes: '2026-01' });
  if (tipo === 'PAGO') entrada.fin = '2026-01-31';
  return {
    id: 42,
    idEmpleado: 1,
    inicio: tipo === 'PAGO' ? '2026-01-16' : entrada.inicio,
    fin: entrada.fin,
    estado: 'PAGADO',
    version: 1,
    snapshot: JSON.stringify({ entrada, resultado }),
  } satisfies Guardado;
}
function textoPdf(b: Buffer) {
  return [...b.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap((m) => {
      try {
        return [
          ...inflateSync(Buffer.from(m[1]!, 'latin1'))
            .toString('latin1')
            .matchAll(/<([a-f\d]+)>/gi),
        ].map((x) => Buffer.from(x[1]!, 'hex').toString('latin1'));
      } catch {
        return [];
      }
    })
    .join('');
}
describe('Boletas carta de dos copias', () => {
  it('regresión del diseño: una hoja carta por empleado, dos copias y conceptos sin cambiar importes', async () => {
    const n = boleta(),
      antes = n.snapshot;
    const pdf = await boletasPdf(
      [n],
      empresaPrueba,
      new Map(),
      new Map([[n.id, { codigoPuesto: 'ANAL', centro: 'Oficina central' }]]),
    );
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 612 792]');
    expect(pdf.toString('latin1')).toContain('/Count 1');
    const texto = textoPdf(pdf);
    for (const s of [
      'INGRESOS',
      'DESCUENTOS',
      'LIQUIDO A RECIBIR',
      'Recibí conforme:',
      'Bonificación Decreto (37-2001)',
      'Oficina central',
      'Analista / ANAL',
    ])
      expect(texto.split(s).length - 1).toBe(2);
    expect(texto.split('MARÍA JOSÉ LÓPEZ PÉREZ')).toHaveLength(5);
    expect(n.snapshot).toBe(antes);
    expect(texto).toContain(monedaBoleta(JSON.parse(n.snapshot).resultado.neto));
  });
  it('sin descuentos deja encabezado y total Q0.00; omite conceptos cero', async () => {
    const n = boleta('ANTICIPO'),
      s = JSON.parse(n.snapshot);
    s.resultado.lineas = s.resultado.lineas.filter(
      (l: { concepto: { naturaleza: string } }) => l.concepto.naturaleza === 'INGRESO',
    );
    s.resultado.lineas.push({
      ...s.resultado.lineas[0],
      descripcion: 'No mostrar este concepto',
      monto: '0.00',
    });
    s.resultado.descuentos = '0.00';
    s.resultado.neto = s.resultado.ingresos;
    n.snapshot = JSON.stringify(s);
    const pdf = await boletasPdf([n], empresaPrueba);
    const texto = textoPdf(pdf);
    expect(texto).not.toContain('No mostrar este concepto');
    expect(texto.split('Q0.00')).toHaveLength(3);
    expect(pdf.toString('latin1')).toContain('/Count 1');
  });
  it('nombres largos, logo, conceptos partidos y dos empleados conservan una hoja por empleado', async () => {
    const n = boleta(),
      s = JSON.parse(n.snapshot);
    s.entrada.empleado.departamento = 'Departamento de Ingeniería y Desarrollo de Sistemas';
    s.entrada.empleado.nombres = 'María Alejandra del Carmen';
    s.entrada.empleado.apellidos = 'López de la Cruz Hernández';
    s.resultado.lineas[0].concepto.codigo = 'PRODUCTIVIDAD';
    s.resultado.lineas[0].descripcion =
      'Bonos de Productividad Decreto 78-89 (Asistencia y desempeño)';
    n.snapshot = JSON.stringify(s);
    const logo = await sharp({
      create: { width: 60, height: 30, channels: 3, background: '#213f60' },
    })
      .png()
      .toBuffer();
    const pdf = await boletasPdf([n, { ...n, id: 43 }], { ...empresaPrueba, logo });
    expect(pdf.toString('latin1')).toContain('/Count 2');
    expect(pdf.toString('latin1')).toContain('/Subtype /Image');
    expect(textoPdf(pdf).split('LIQUIDO A RECIBIR')).toHaveLength(5);
  });
  it('marca ambas copias de simulación', async () => {
    const pdf = await boletasPdf([{ ...boleta(), estado: 'SIMULACION' }], empresaPrueba);
    expect(textoPdf(pdf).split('SIMULACIÓN')).toHaveLength(3);
  });
  it('nombres y título usan fechas de la liquidación real, incluidos febrero bisiesto e históricos', () => {
    expect(nombreBoleta(boleta('ANTICIPO'))).toBe(
      'Anticipo - Planilla General del 01-01-2026 al 15-01-2026.pdf',
    );
    expect(nombreBoleta(boleta('PAGO'))).toBe('Planilla General del 01-01-2026 al 31-01-2026.pdf');
    expect(nombreBoleta(boleta('PAGO'), true)).toBe(
      'Planilla General del 01-01-2026 al 31-01-2026 - EMP_ING_0001.pdf',
    );
    const n = { ...boleta(), inicio: '2028-02-16', fin: '2028-02-29' };
    expect(tituloBoleta(n)).toBe('Planilla General del 16-02-2028 al 29-02-2028');
    expect(nombreLoteBoletas([boleta('ANTICIPO'), boleta('PAGO')], 'zip')).toBe(
      'Planilla General del 01-01-2026 al 31-01-2026.zip',
    );
  });
  it('identificador estable incluye id único, NIT, código, fecha de pago y tipo', () => {
    expect(identificadorBoleta({ ...boleta(), fechaPago: '2026-01-15' }, empresaPrueba)).toBe(
      '42-12345679-EMP_ING_0001-20260115-A',
    );
    expect(identificadorBoleta(boleta('PAGO'), empresaPrueba)).toMatch(/-20260131-P$/);
  });
  it('días visibles descuentan ausencias sin goce aprobadas sin alterar el cálculo', () => {
    const n = boleta(),
      s = JSON.parse(n.snapshot);
    s.entrada.ausencias = [
      { id: 1, inicio: '2026-01-05', fin: '2026-01-06', efecto: 'SIN_GOCE', estado: 'APROBADA' },
    ];
    n.snapshot = JSON.stringify(s);
    expect(diasBoleta(n)).toBe('13');
  });
  it('el título de una entrada ZIP coincide con su nombre sin reescribir el PDF original', async () => {
    const n = boleta(),
      original = await boletasPdf([n], empresaPrueba),
      copia = Buffer.from(original);
    const titulo = nombreBoleta(n, true).slice(0, -4);
    const zipPdf = conTituloPdf(original, titulo);
    expect(original).toEqual(copia);
    expect(zipPdf.subarray(0, original.length)).toEqual(original);
    expect(zipPdf.toString('latin1')).toContain(
      `/Title <feff${Buffer.from(titulo, 'utf16le').swap16().toString('hex')}>`,
    );
    expect(textoPdf(zipPdf)).toBe(textoPdf(original));
  });
});
