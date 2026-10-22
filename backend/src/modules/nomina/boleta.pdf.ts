import PDFDocument from 'pdfkit';
import { Decimal } from 'decimal.js';
import type { Guardado } from './nomina.repository.js';
import type { Snapshot } from './nomina.exportar.js';
import type { EntradaPago, ResultadoPago } from './pago.calculo.js';
import type { IdentidadEmpresa } from '../../shared/pdf/documento.js';
import { exigirMembrete } from '../../shared/pdf/documento.js';
import { nombreArchivo } from '../../shared/utils/archivo.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import { fechas } from './nomina.calculo.js';

export const FORMATO_BOLETA = 'nomina2:boleta:v2';
export interface DatosBoleta {
  codigoPuesto: string;
  centro: string;
}
const datos = (n: Guardado) => JSON.parse(n.snapshot) as Snapshot;
export const esPrestacion = (n: Guardado) =>
  ['BONO_14', 'AGUINALDO'].includes((datos(n).resultado as ResultadoPago).tipoPago);
export function periodoBoleta(n: Guardado) {
  const s = datos(n),
    r = s.resultado as ResultadoPago;
  const anticipo = r.tipoPago ? r.tipoPago === 'ANTICIPO' : n.fin.endsWith('-15');
  if (r.tipoPago === 'ANTICIPO') return { inicio: `${r.mes}-01`, fin: `${r.mes}-15`, anticipo };
  if (r.tipoPago === 'PAGO') return { inicio: s.entrada.inicio, fin: s.entrada.fin, anticipo };
  return { inicio: n.inicio, fin: n.fin, anticipo };
}
const fecha = (s: string, separador: string) => s.split('-').reverse().join(separador);
export function tituloBoleta(n: Guardado) {
  const p = periodoBoleta(n);
  if (esPrestacion(n))
    return `Boleta de ${(datos(n).resultado as ResultadoPago).tipoPago === 'BONO_14' ? 'Bono 14' : 'Aguinaldo'} del ${fecha(p.inicio, '-')} al ${fecha(p.fin, '-')}`;
  return `${p.anticipo ? 'Anticipo - ' : ''}Planilla General del ${fecha(p.inicio, '-')} al ${fecha(p.fin, '-')}`;
}
export function nombreBoleta(n: Guardado, enZip = false) {
  return nombreArchivo(
    `${tituloBoleta(n)}${enZip ? ` - ${datos(n).entrada.empleado.codigo}` : ''}.pdf`,
  );
}
export function nombreLoteBoletas(ns: Guardado[], extension: 'pdf' | 'zip') {
  const periodos = ns.map(periodoBoleta);
  const inicio = periodos.map((p) => p.inicio).sort()[0]!;
  const fin = periodos
    .map((p) => p.fin)
    .sort()
    .at(-1)!;
  return nombreArchivo(
    `${periodos.every((p) => p.anticipo) ? 'Anticipo - ' : ''}Planilla General del ${fecha(inicio, '-')} al ${fecha(fin, '-')}.${extension}`,
  );
}
export function identificadorBoleta(n: Guardado, empresa: IdentidadEmpresa) {
  const p = periodoBoleta(n),
    e = datos(n).entrada.empleado;
  // El NIT identifica a la empresa; no existe un código de empresa en su configuración.
  return `${String(n.id).padStart(2, '0')}-${empresa.nit.replace(/[^\dK]/gi, '')}-${e.codigo}-${(n.fechaPago ?? p.fin).replaceAll('-', '')}-${p.anticipo ? 'A' : 'P'}`;
}
export function diasBoleta(n: Guardado) {
  const s = datos(n),
    p = periodoBoleta(n),
    e = s.entrada.empleado;
  const contrato = fechas(p.inicio, p.fin).filter(
    (f) => f >= e.ingreso && (!e.egreso || f <= e.egreso),
  );
  const mensual = s.entrada as EntradaPago;
  if (mensual.novedades) {
    const ausencias = mensual.novedades.filter(
      (v) =>
        v.tipo === 'AUSENCIA' &&
        v.autorizacion === 'APROBADA' &&
        new Decimal(v.monto ?? 0).gt(0) &&
        v.mes === p.inicio.slice(0, 7),
    );
    // Las novedades mensuales no conservan fechas diarias: se limita su cantidad al intervalo.
    return Decimal.max(
      0,
      new Decimal(contrato.length).minus(Decimal.sum(0, ...ausencias.map((v) => v.cantidad))),
    ).toString();
  }
  const ausentes = contrato.filter(
    (f) =>
      s.entrada.ausencias.some(
        (a) => a.efecto === 'SIN_GOCE' && a.estado === 'APROBADA' && a.inicio <= f && a.fin >= f,
      ) &&
      s.entrada.horarios.some(
        (h) =>
          h.desde <= f &&
          (!h.hasta || h.hasta >= f) &&
          h.dias.includes(new Date(`${f}T12:00:00Z`).getUTCDay() || 7),
      ) &&
      !s.entrada.feriados.includes(f),
  );
  return String(contrato.length - ausentes.length);
}
export function monedaBoleta(m: string) {
  const [entero, decimales] = new Decimal(m).toFixed(2).split('.');
  return `Q${entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimales}`;
}

export async function generarBoletasPdf(
  filas: Guardado[],
  identidad: IdentidadEmpresa,
  complementos: Map<number, DatosBoleta>,
) {
  const empresa = exigirMembrete(identidad);
  const titulo =
    filas.length === 1 ? tituloBoleta(filas[0]!) : nombreLoteBoletas(filas, 'pdf').slice(0, -4);
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 42.52,
    bufferPages: true,
    info: { Title: titulo, Author: empresa.razonSocial, Subject: FORMATO_BOLETA },
  });
  const partes: Buffer[] = [];
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  try {
    filas.forEach((n, i) => {
      if (i) doc.addPage();
      const s = datos(n),
        e = s.entrada.empleado,
        r = s.resultado;
      const p = periodoBoleta(n),
        extra = complementos.get(n.id);
      const nombre = `${e.nombres} ${e.apellidos}`.toUpperCase();
      const ancho = 612 - 85.04,
        alto = (792 - 85.04 - 30) / 2;
      const ingresos = r.lineas.filter(
        (l) => l.concepto.naturaleza === 'INGRESO' && new Decimal(l.monto).gt(0),
      );
      const egresos = r.lineas.filter(
        (l) => l.concepto.naturaleza === 'DESCUENTO' && new Decimal(l.monto).gt(0),
      );
      const columna = (ancho - 20) / 2,
        montoAncho = 76;
      const concepto = `Regular - ${p.anticipo ? 'Anticipo ' : ''}Planilla General del ${fecha(p.inicio, '/')} al ${fecha(p.fin, '/')}`;
      const campos = [
        ['Código / Empleado', `${e.codigo} / ${nombre}`],
        ['NIT empleado', e.nit],
        ['Departamento / Grupo', `${e.departamento} / ${extra?.centro ?? e.localidad}`],
        ['Puesto / Código', `${e.puesto} / ${extra?.codigoPuesto ?? 'No registrado'}`],
        ['Días trabajados', diasBoleta(n)],
        ['Concepto / Periodo', concepto],
      ];
      let tamano = 8.5;
      const medir = (texto: string, width: number, negrita = false) =>
        doc
          .font(negrita ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(tamano)
          .heightOfString(texto, { width, lineGap: 0 });
      const nombreLinea = (l: (typeof ingresos)[number]) =>
        l.concepto.codigo === 'SALARIO_BASE'
          ? 'Sueldo'
          : l.concepto.codigo === 'BONIFICACION_INCENTIVO'
            ? 'Bonificación Decreto (37-2001)'
            : l.descripcion;
      const filasAltura = (ls: typeof ingresos) =>
        ls.map(
          (l) =>
            Math.max(
              medir(nombreLinea(l), columna - montoAncho - 5),
              medir(monedaBoleta(l.monto), montoAncho),
            ) + 2,
        );
      const nota = r.estimacionFiscal
        ? 'Acumulados anteriores estimados automáticamente para la simulación académica.'
        : '';
      const aviso = !['CERRADO', 'PAGADO'].includes(n.estado)
        ? n.estado === 'SIMULACION'
          ? 'SIMULACIÓN - Sin validez de pago'
          : 'VISTA PREVIA - Periodo pendiente de cierre'
        : '';
      const leyenda = `Su pago ha sido acreditado. Gracias por su colaboración. Saludos de ${empresa.razonSocial}.`;
      const alturas = () => {
        const cabecera = Math.max(
          28,
          medir(empresa.razonSocial.toUpperCase(), ancho - (empresa.logo ? 42 : 8), true) + 16,
        );
        const camposAlto = campos.map(
          ([etiqueta, valor]) =>
            Math.max(medir(etiqueta!, 112, true), medir(valor!, ancho - 119)) + 1.5,
        );
        const entradas = filasAltura(ingresos),
          salidas = filasAltura(egresos);
        const tabla = Math.max(
          entradas.reduce((a, b) => a + b, 0),
          salidas.reduce((a, b) => a + b, 0),
          24,
        );
        const notas = [aviso, nota].filter(Boolean).join('\n');
        const notasAlto = notas ? medir(notas, ancho) + 3 : 0;
        const firmaAlto = medir(nombre, ancho * 0.68 - 85);
        const total =
          cabecera +
          camposAlto.reduce((a, b) => a + b, 0) +
          7 +
          notasAlto +
          15 +
          tabla +
          26 +
          39 +
          22 +
          firmaAlto +
          medir(leyenda, ancho);
        return {
          cabecera,
          camposAlto,
          entradas,
          salidas,
          tabla,
          notas,
          notasAlto,
          firmaAlto,
          total,
        };
      };
      let h = alturas();
      while (h.total > alto && tamano > 7) {
        tamano -= 0.25;
        h = alturas();
      }
      if (h.total > alto)
        throw new ErrorConflicto(
          'La boleta contiene demasiados conceptos o textos para dos copias legibles en una hoja carta. Reduce la extensión de las descripciones de los conceptos.',
        );
      const texto = (
        valor: string,
        x: number,
        y: number,
        width: number,
        bold = false,
        align: 'left' | 'right' | 'center' = 'left',
      ) =>
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(tamano)
          .fillColor('#000000')
          .text(valor, x, y, { width, align, lineGap: 0 });
      // Coordenadas explícitas y alturas verificadas: PDFKit nunca agrega una hoja por desborde.
      for (const arriba of [42.52, 42.52 + alto + 30]) {
        const x = 42.52;
        let y = arriba;
        doc.rect(x, y, ancho, h.cabecera).fill('#E0E0E0');
        if (empresa.logo) doc.image(empresa.logo, x + 3, y + 2, { fit: [34, h.cabecera - 16] });
        texto(
          empresa.razonSocial.toUpperCase(),
          x + (empresa.logo ? 42 : 2),
          y + 2,
          ancho - (empresa.logo ? 44 : 4),
          true,
        );
        texto('NIT empresa', x + 2, y + h.cabecera - 12, 110, true);
        texto(empresa.nit, x + ancho * 0.45, y + h.cabecera - 12, ancho * 0.2, true, 'center');
        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(identificadorBoleta(n, empresa), x + ancho * 0.65, y + h.cabecera - 11, {
            width: ancho * 0.35 - 2,
            align: 'right',
            lineBreak: false,
          });
        y += h.cabecera + 2;
        campos.forEach(([etiqueta, valor], j) => {
          texto(etiqueta!, x, y, 112, true);
          texto(
            valor!,
            x + 119,
            y,
            ancho - 119,
            false,
            etiqueta === 'NIT empleado' ? 'right' : 'left',
          );
          y += h.camposAlto[j]!;
        });
        if (h.notas) {
          texto(h.notas, x, y + 1, ancho);
          y += h.notasAlto;
        }
        y += 5;
        const tablaY = y;
        [ingresos, egresos].forEach((ls, col) => {
          const cx = x + col * (columna + 20);
          doc.rect(cx, tablaY, columna, 13).fill('#E0E0E0');
          texto(col === 0 ? 'INGRESOS' : 'DESCUENTOS', cx, tablaY + 2, columna, true, 'center');
          let filaY = tablaY + 15;
          ls.forEach((l, j) => {
            const altura = (col === 0 ? h.entradas : h.salidas)[j]!;
            texto(nombreLinea(l), cx + 1, filaY, columna - montoAncho - 5);
            texto(
              monedaBoleta(l.monto),
              cx + columna - montoAncho,
              filaY + altura - medir(monedaBoleta(l.monto), montoAncho) - 2,
              montoAncho - 1,
              false,
              'right',
            );
            filaY += altura;
          });
          const totalY = tablaY + 15 + h.tabla;
          doc
            .moveTo(cx, totalY)
            .lineTo(cx + columna, totalY)
            .moveTo(cx, totalY + 15)
            .lineTo(cx + columna, totalY + 15)
            .lineWidth(0.6)
            .strokeColor('#000000')
            .stroke();
          texto(
            col === 0 ? 'TOTAL Ingresos' : 'TOTAL Egresos',
            cx + 1,
            totalY + 3,
            columna - montoAncho,
            true,
          );
          texto(
            monedaBoleta(col === 0 ? r.ingresos : r.descuentos),
            cx + columna - montoAncho,
            totalY + 3,
            montoAncho - 1,
            true,
            'right',
          );
        });
        y = tablaY + 15 + h.tabla + 26;
        const cajaX = x + ancho * 0.2,
          cajaAncho = ancho * 0.6;
        doc
          .rect(cajaX, y, cajaAncho / 2, 20)
          .rect(cajaX + cajaAncho / 2, y, cajaAncho / 2, 20)
          .stroke();
        texto('LIQUIDO A RECIBIR', cajaX, y + 5, cajaAncho / 2, true, 'center');
        texto(monedaBoleta(r.neto), cajaX + cajaAncho / 2, y + 5, cajaAncho / 2, true, 'center');
        y += 39;
        texto('Recibí conforme:', x + ancho * 0.2, y, 85);
        doc
          .moveTo(x + ancho * 0.2 + 85, y + 9)
          .lineTo(x + ancho * 0.88, y + 9)
          .stroke();
        texto(nombre, x + ancho * 0.2 + 85, y + 12, ancho * 0.68 - 85, false, 'center');
        texto(leyenda, x, y + 22 + h.firmaAlto, ancho, false, 'center');
      }
    });
    doc.end();
  } catch (error) {
    doc.destroy();
    throw error;
  }
  return listo;
}
