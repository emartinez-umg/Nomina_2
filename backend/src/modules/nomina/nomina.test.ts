import { empresaPrueba } from '../../shared/pdf/documento.fixture.js';
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { unzipSync, strFromU8 } from 'fflate';
import { calcularNomina, validarTransicion } from './nomina.calculo.js';
import { completarHistoria } from './nomina.service.js';
import { entradaPrueba } from './nomina.fixture.js';
import { accionSchema, querySchema, formatoSchema } from './nomina.schemas.js';
import { boletasPdf, excel, reporteIgss } from './nomina.exportar.js';
import type { Guardado } from './nomina.repository.js';
const linea = (r: ReturnType<typeof calcularNomina>, c: string) =>
  r.lineas
    .filter((l) => l.concepto.codigo === c)
    .reduce((s, l) => s.plus(l.monto), new Decimal(0))
    .toFixed(2);
describe('Motor quincenal: importes exactos y vigencias', () => {
  it('salario bajo: mitad, incentivo, IGSS, cero ISR y patronal', () => {
    const r = calcularNomina(entradaPrueba());
    expect(r).toMatchObject({
      dias: '15.00',
      ingresos: '1625.00',
      descuentos: '72.45',
      neto: '1552.55',
      patronal: '190.05',
      baseIgss: '1500.00',
    });
    expect(r.isr).toMatchObject({
      renta: '39000.00',
      anual: '0.00',
      retencion: '0.00',
      restantes: 24,
    });
  });
  it('salario alto: escala marginal, proyección IGSS y retención', () => {
    const r = calcularNomina(entradaPrueba('40000'));
    expect(r.isr).toMatchObject({
      renta: '483000.00',
      igss: '23184.00',
      imponible: '411816.00',
      anual: '22827.12',
      retencion: '951.13',
    });
    expect(r.neto).toBe('18207.87');
  });
  it('ingreso a mitad de primera quincena prorratea salario y bonificación', () => {
    const e = entradaPrueba('6000');
    e.empleado.ingreso = '2026-01-08';
    const r = calcularNomina(e);
    expect(r.dias).toBe('8.00');
    expect(linea(r, 'SALARIO_BASE')).toBe('1600.00');
    expect(linea(r, 'BONIFICACION_INCENTIVO')).toBe('66.67');
    expect(r.neto).toBe('1543.28');
  });
  it.each([
    ['2026-02-16', '2026-02-28'],
    ['2026-03-16', '2026-03-31'],
    ['2026-04-16', '2026-04-30'],
  ])('quincena completa %s conserva mitad mensual', (inicio, fin) => {
    const e = entradaPrueba();
    e.inicio = inicio;
    e.fin = fin;
    const r = calcularNomina(e);
    expect(linea(r, 'SALARIO_BASE')).toBe('1500.00');
    expect(linea(r, 'BONIFICACION_INCENTIVO')).toBe('125.00');
  });
  it('egreso prorratea y termina proyección futura', () => {
    const e = entradaPrueba();
    e.empleado.egreso = '2026-01-10';
    const r = calcularNomina(e);
    expect(r.dias).toBe('10.00');
    expect(linea(r, 'SALARIO_BASE')).toBe('1000.00');
    expect(r.isr.futuro).toBe('0.00');
    expect(r.isr.restantes).toBe(1);
  });
  it('ausencia sin goce reduce salario afecto y bonificación una sola vez', () => {
    const e = entradaPrueba('6000');
    e.ausencias = [
      { id: 1, inicio: '2026-01-05', fin: '2026-01-05', estado: 'APROBADA', efecto: 'SIN_GOCE' },
    ];
    const r = calcularNomina(e);
    expect(r.dias).toBe('14.00');
    expect(linea(r, 'AUSENCIA_SIN_GOCE')).toBe('200.00');
    expect(linea(r, 'BONIFICACION_INCENTIVO')).toBe('116.67');
    expect(r.baseIgss).toBe('2800.00');
    expect(r.neto).toBe('2732.84');
  });
  it('ausencia solo cuenta horario propio y excluye feriados', () => {
    const e = entradaPrueba();
    e.horarios[0]!.dias = [4, 5, 6, 7];
    e.feriados = ['2026-01-02'];
    e.ausencias = [
      { id: 1, inicio: '2026-01-01', fin: '2026-01-05', estado: 'APROBADA', efecto: 'SIN_GOCE' },
    ];
    const r = calcularNomina(e);
    expect(linea(r, 'AUSENCIA_SIN_GOCE')).toBe('300.00');
    expect(r.dias).toBe('12.00');
  });
  it('permiso con goce conserva ingresos e incapacidad usa efecto configurado', () => {
    const e = entradaPrueba();
    e.ausencias = [
      { id: 1, inicio: '2026-01-05', fin: '2026-01-05', estado: 'APROBADA', efecto: 'CON_GOCE' },
    ];
    expect(calcularNomina(e).neto).toBe('1552.55');
    e.ausencias[0]!.efecto = 'SUBSIDIO_IGSS';
    expect(linea(calcularNomina(e), 'AUSENCIA_SIN_GOCE')).toBe('100.00');
  });
  it('horas extra calcula sin redondear anticipadamente el valor hora', () => {
    const e = entradaPrueba();
    e.horas = [{ id: 1, fecha: '2026-01-06', horas: '10', jornada: 'DIURNA', estado: 'APROBADA' }];
    const r = calcularNomina(e);
    expect(linea(r, 'HORAS_EXTRA')).toBe('187.50');
    expect(linea(r, 'IGSS_LABORAL')).toBe('81.51');
    expect(r.neto).toBe('1730.99');
  });
  it.each([
    ['MIXTA', '214.29'],
    ['NOCTURNA', '250.00'],
  ])('horas de jornada %s desde parámetros', (jornada, monto) => {
    const e = entradaPrueba();
    e.horas = [{ id: 1, fecha: '2026-01-06', horas: '10', jornada, estado: 'APROBADA' }];
    expect(linea(calcularNomina(e), 'HORAS_EXTRA')).toBe(monto);
  });
  it('comisión afecta bases conforme a banderas de BD', () => {
    const e = entradaPrueba();
    e.comisiones = [{ id: 1, monto: '1000' }];
    const r = calcularNomina(e);
    expect(r.neto).toBe('2504.25');
    expect(r.baseIgss).toBe('2500.00');
    e.conceptos.find((c) => c.codigo === 'COMISION')!.igss = 0;
    expect(calcularNomina(e).baseIgss).toBe('1500.00');
  });
  it('última cuota se limita al saldo real y conserva origen', () => {
    const e = entradaPrueba();
    e.descuentos = [
      { id: 1, cuota: 3, codigo: 'PRESTAMO', modalidad: 'CUOTAS', monto: '33.34', saldo: '16.67' },
    ];
    const r = calcularNomina(e);
    expect(linea(r, 'PRESTAMO')).toBe('16.67');
    expect(r.neto).toBe('1535.88');
    expect(r.lineas.at(-1)!.descuento!.cuota).toBe(3);
  });
  it.each(['ANTICIPO', 'EMBARGO', 'PARQUEO', 'CONSUMO_TIENDA', 'OTROS'])(
    'aplica descuento %s automáticamente',
    (codigo) => {
      const e = entradaPrueba();
      e.descuentos = [
        { id: 1, cuota: null, codigo, modalidad: 'FIJO', monto: '12.34', saldo: null },
      ];
      expect(calcularNomina(e).neto).toBe('1540.21');
    },
  );
  it('varias cuotas vencidas respetan el saldo conjunto y admiten tipos adicionales', () => {
    const e = entradaPrueba();
    e.descuentos = [
      { id: 1, cuota: 1, codigo: 'CUOTA_SINDICAL', modalidad: 'CUOTAS', monto: '50', saldo: '80' },
      { id: 1, cuota: 2, codigo: 'CUOTA_SINDICAL', modalidad: 'CUOTAS', monto: '50', saldo: '80' },
    ];
    const r = calcularNomina(e);
    expect(linea(r, 'OTRO_DESCUENTO')).toBe('80.00');
    expect(r.neto).toBe('1472.55');
  });
  it('reproduce el mismo resultado exclusivamente desde la entrada conservada', () => {
    const e = entradaPrueba('14567.89');
    e.comisiones = [{ id: 1, monto: '111.11' }];
    const r = calcularNomina(e),
      s = JSON.parse(JSON.stringify({ entrada: e, resultado: r }));
    expect(calcularNomina(s.entrada)).toEqual(s.resultado);
  });
  it('bloquea neto negativo sin devolver resultado persistible', () => {
    const e = entradaPrueba();
    e.descuentos = [
      { id: 1, cuota: null, codigo: 'EMBARGO', modalidad: 'FIJO', monto: '2000', saldo: null },
    ];
    expect(() => calcularNomina(e)).toThrow(/neto.*negativo/);
  });
  it('diciembre usa reales acumulados y ajusta el último centavo de ISR', () => {
    const e = entradaPrueba('6000');
    e.inicio = '2026-12-16';
    e.fin = '2026-12-31';
    e.acumulado = { renta: '71875', igss: '3332.70', isr: '1176.06' };
    const r = calcularNomina(e);
    expect(r.isr).toMatchObject({
      renta: '75000.00',
      igss: '3477.60',
      imponible: '23522.40',
      anual: '1176.12',
      restantes: 1,
      retencion: '0.06',
    });
    expect(r.neto).toBe('2980.04');
  });
  it('diciembre reintegra el exceso de ISR como ingreso exento auditable', () => {
    const e = entradaPrueba('6000');
    e.inicio = '2026-12-16';
    e.fin = '2026-12-31';
    e.acumulado = { renta: '71875', igss: '3332.70', isr: '2000' };
    const r = calcularNomina(e);
    expect(r.isr.retencion).toBe('0.00');
    expect(linea(r, 'ISR_DEVOLUCION')).toBe('823.88');
    expect(r.neto).toBe('3803.98');
    expect(r.isr.renta).toBe('75000.00');
  });
  it('deducciones agrupan comprobantes y aplican un único tope por tipo', () => {
    const e = entradaPrueba('40000');
    e.deducciones = [
      { id: 1, tipo: 'DONACIONES', monto: '20000', tope: 'ISR_DONACIONES_TOPE_PORCENTAJE' },
      { id: 2, tipo: 'DONACIONES', monto: '20000', tope: 'ISR_DONACIONES_TOPE_PORCENTAJE' },
      { id: 3, tipo: 'SEGURO', monto: '3000', tope: null },
    ];
    expect(calcularNomina(e).isr.acreditadas).toBe('27150.00');
  });
  it('aguinaldo y bono 14 solo agregan el excedente de la exención vigente', () => {
    const e = entradaPrueba('6000');
    e.prestaciones = [
      { id: 1, tipo: 'AGUINALDO', monto: '7000' },
      { id: 2, tipo: 'BONO_14', monto: '6000' },
    ];
    expect(calcularNomina(e).isr.renta).toBe('76000.00');
  });
  it('vigencia intermedia cambia tasa y conserva ambos parámetros', () => {
    const e = entradaPrueba();
    const p = e.parametros.find((v) => v.codigo === 'IGSS_LABORAL_PORCENTAJE')!;
    p.hasta = '2026-01-07';
    e.parametros.push({ ...p, id: 100, valor: '6', desde: '2026-01-08', hasta: null });
    const r = calcularNomina(e);
    expect(linea(r, 'IGSS_LABORAL')).toBe('81.81');
    expect(r.parametros.filter((v) => v.codigo === p.codigo).map((v) => v.valor)).toEqual([
      '4.83',
      '6',
    ]);
  });
  it('ausencias usan tasa histórica y bonificación de su propia vigencia', () => {
    const e = entradaPrueba();
    const p = e.parametros.find((v) => v.codigo === 'IGSS_LABORAL_PORCENTAJE')!;
    p.hasta = '2026-01-07';
    e.parametros.push({ ...p, id: 100, valor: '6', desde: '2026-01-08', hasta: null });
    e.ausencias = [
      { id: 1, inicio: '2026-01-05', fin: '2026-01-05', estado: 'APROBADA', efecto: 'SIN_GOCE' },
    ];
    expect(linea(calcularNomina(e), 'IGSS_LABORAL')).toBe('76.98');
  });
  it('salario programado intermedio se pondera y se proyecta', () => {
    const e = entradaPrueba();
    e.salarios[0]!.hasta = '2026-01-07';
    e.salarios.push({ id: 2, monto: '6000', desde: '2026-01-08', hasta: null });
    const r = calcularNomina(e);
    expect(linea(r, 'SALARIO_BASE')).toBe('2300.00');
    expect(r.idSalario).toBe(2);
    expect(r.isr.futuro).toBe('71875.00');
  });
  it('falta o ambigüedad de vigencia y escala rota bloquean cálculo', () => {
    const e = entradaPrueba();
    e.parametros = e.parametros.filter((p) => p.codigo !== 'IGSS_LABORAL_PORCENTAJE');
    expect(() => calcularNomina(e)).toThrow(/única vigencia/);
    const f = entradaPrueba();
    f.tramos[1]!.inferior = '300001';
    expect(() => calcularNomina(f)).toThrow(/continuos/);
  });
  it('novedades pendientes generan avisos y no se pagan como aprobadas', () => {
    const e = entradaPrueba();
    e.horas = [{ id: 1, fecha: '2026-01-06', horas: '10', jornada: 'DIURNA', estado: 'PENDIENTE' }];
    expect(calcularNomina(e).alertas).toHaveLength(1);
    expect(calcularNomina(e).neto).toBe('1552.55');
  });
  it('suma de líneas coincide con totales en salarios con centavos', () => {
    for (const salario of ['1.01', '3333.33', '5999.99', '99999.99']) {
      const r = calcularNomina(entradaPrueba(salario));
      expect(new Decimal(r.ingresos).minus(r.descuentos).toFixed(2)).toBe(r.neto);
      expect(linea(r, 'SALARIO_BASE')).toBe(
        new Decimal(salario).div(2).toFixed(2, Decimal.ROUND_HALF_UP),
      );
    }
  });
});
describe('Cierre, reapertura y continuidad fiscal', () => {
  it('exige todas las transiciones y bloquea recálculo de aprobados/cerrados', () => {
    for (const [estado, accion] of [
      ['ABIERTO', 'calcular'],
      ['CALCULADO', 'revisar'],
      ['REVISADO', 'aprobar'],
      ['APROBADO', 'cerrar'],
    ] as const)
      expect(() => validarTransicion(estado, accion, 'RH')).not.toThrow();
    for (const [estado, accion] of [
      ['ABIERTO', 'cerrar'],
      ['CALCULADO', 'aprobar'],
      ['APROBADO', 'calcular'],
      ['CERRADO', 'calcular'],
      ['CERRADO', 'cerrar'],
    ] as const)
      expect(() => validarTransicion(estado, accion, 'ADMIN')).toThrow();
  });
  it('solo ADMIN reabre con motivo suficiente', () => {
    expect(() => validarTransicion('CERRADO', 'reabrir', 'RH', 'Corrección real de datos')).toThrow(
      /Solo ADMIN/,
    );
    expect(() => validarTransicion('CERRADO', 'reabrir', 'ADMIN', '')).toThrow(/motivo/);
    expect(() =>
      validarTransicion('CERRADO', 'reabrir', 'ADMIN', 'Corrección de comisión'),
    ).not.toThrow();
  });
  it('bloquea historia incompleta y permite apertura certificada sin duplicación', () => {
    const e = {
      ...entradaPrueba(),
      inicio: '2026-10-01',
      fin: '2026-10-15',
      historia: { apertura: null, previos: [] },
    };
    expect(() => completarHistoria(e)).toThrow(/historia fiscal/);
    const f = {
      ...e,
      historia: {
        apertura: { corte: '2026-09-30', renta: '29250', igss: '1304.10', isr: '0' },
        previos: [],
      },
    };
    expect(completarHistoria(f).acumulado.renta).toBe('29250.00');
  });
  it('esquemas rechazan SQL en orden, campos ajenos y falta de confirmación', () => {
    expect(querySchema.safeParse({ ordenarPor: 'NETO; DROP TABLE X' }).success).toBe(false);
    expect(accionSchema.safeParse({ version: 1, confirmado: false }).success).toBe(false);
    expect(querySchema.safeParse({ usuario: 4 }).success).toBe(false);
  });
});
describe('Exportaciones exactas', () => {
  it('boleta PDF contiene documento válido y Excel tiene estructura OOXML segura', async () => {
    const e = entradaPrueba(),
      resultado = calcularNomina(e),
      n: Guardado = {
        id: 1,
        idEmpleado: 1,
        inicio: e.inicio,
        fin: e.fin,
        estado: 'CERRADO',
        version: 1,
        snapshot: JSON.stringify({ entrada: e, resultado, empresa: null }),
      };
    const pdf = await boletasPdf([n], empresaPrueba);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const x = unzipSync(
      excel([
        ['Empleado', 'Neto'],
        ['=1+1', resultado.neto],
      ]),
    );
    expect(strFromU8(x['xl/worksheets/sheet1.xml']!)).toContain('inlineStr');
    expect(strFromU8(x['xl/worksheets/sheet1.xml']!)).not.toContain('<f>');
  });
  it('formato IGSS rechaza separadores inyectados', () => {
    expect(formatoSchema.safeParse({ nombre: 'EMPRESA|OTRA' }).success).toBe(false);
  });
  it('archivo IGSS tiene 19 campos de empleado, consolidado mensual y bloques oficiales', () => {
    const e = entradaPrueba(),
      r = calcularNomina(e),
      n: Guardado = {
        id: 1,
        idEmpleado: 1,
        inicio: e.inicio,
        fin: e.fin,
        estado: 'CERRADO',
        version: 1,
        snapshot: JSON.stringify({ entrada: e, resultado: r, empresa: null }),
      };
    const formato = formatoSchema.parse({
      version: '2.2.0',
      patrono: '12345',
      pruebas: '1',
      nombre: 'Empresa Prueba',
      nit: '1234567-9',
      direccion: 'Dirección prueba',
      correo: 'igss@example.test',
      centros: [
        {
          id: 1,
          codigo: '1',
          nombre: 'Centro',
          direccion: 'Dirección',
          zona: '1',
          telefono: '',
          fax: '',
          contacto: '',
          correo: '',
          departamento: '1',
          municipio: '1',
          actividad: '451001',
        },
      ],
      tipos: [
        {
          codigo: '1',
          nombre: 'Mensual',
          afiliado: 'C',
          periodo: 'M',
          departamento: '1',
          actividad: '451001',
          clase: 'N',
          tiempo: 'TC',
        },
      ],
      empleados: [
        {
          id: 1,
          tipo: '1',
          ocupacion: '4190',
          condicion: 'P',
          salario: '1',
          primerNombre: 'Persona',
          otrosNombres: '',
          primerApellido: 'Prueba',
          segundoApellido: '',
          apellidoCasada: '',
        },
      ],
    });
    const a = reporteIgss([n, n], formato, 2026, 1, new Date('2026-02-01T18:34:00Z')),
      s = Buffer.from(a.base64, 'base64').toString();
    expect(s).toContain('[Liquidaciones]\r\n1|1|01/01/2026|31/01/2026|O|');
    const registro = s.split('[Empleados]\r\n')[1]!.split('\r\n')[0]!;
    expect(registro.split('|')).toHaveLength(19);
    expect(registro.split('|')[7]).toBe('3000.00');
    expect(a.nombre).toBe('12345-202601-01022026-1234.txt');
    formato.tipos[0]!.tiempo = 'TP';
    e.jornadas = e.horarios[0]!.dias.map((dia) => ({
      desde: '2026-01-01',
      hasta: null,
      dia,
      horas: '4',
    }));
    n.snapshot = JSON.stringify({ entrada: e, resultado: r, empresa: null });
    const parcial = Buffer.from(reporteIgss([n], formato, 2026, 1).base64, 'base64').toString();
    expect(parcial.split('[Empleados]\r\n')[1]!.split('\r\n')[0]!.split('|')[16]).toBe('44.00');
  });
});
