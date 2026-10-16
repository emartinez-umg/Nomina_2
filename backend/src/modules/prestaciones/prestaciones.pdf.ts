import { generarPdf, bloqueFirma } from '../../shared/pdf/documento.js';
import type { IdentidadEmpresa, FirmaDocumento } from '../../shared/pdf/documento.js';
import { Decimal } from 'decimal.js';
import type { Registro, Empleado } from './prestaciones.repository.js';
import type { Snapshot } from './prestaciones.service.js';
const visible = (s: string) => s.split('-').reverse().join('/');
const q = (s: string) => `Q ${new Decimal(s).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
function cabecera(doc: PDFKit.PDFDocument, titulo: string, empresa: string) {
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#213F60').text(titulo).moveDown(0.5);
  doc.fontSize(11).fillColor('#365D35').text(empresa).moveDown();
  doc.font('Helvetica').fontSize(10).fillColor('#25303B');
}
export function prestacionPdf(
  r: Registro,
  s: Snapshot,
  empresa: IdentidadEmpresa,
  firma: FirmaDocumento | null,
) {
  return generarPdf('Prestaciones de ley', empresa, (doc) => {
    const header = () => {
      cabecera(
        doc,
        r.tipo === 'INDEMNIZACION'
          ? 'Liquidación laboral'
          : r.tipo === 'BONO_14'
            ? 'Bono 14'
            : 'Aguinaldo',
        empresa.razonSocial,
      );
      doc
        .text(s.empleado)
        .text(`${visible(s.inicio)} al ${visible(s.fin)}`)
        .text(`Registro ${r.id} - Estado: ${r.estado}`)
        .moveDown();
    };
    header();
    if (r.estado === 'SIMULACION')
      doc
        .fillColor('#8A4617')
        .text('SIMULACIÓN - Sin baja ni validez de pago')
        .moveDown()
        .fillColor('#25303B');
    if (r.estado !== 'PAGADA')
      doc
        .fillColor('#8A4617')
        .text('PENDIENTE DE PAGO - Este documento no acredita un desembolso.')
        .moveDown()
        .fillColor('#25303B');
    for (const l of s.componentes) {
      if (doc.y > 570) {
        doc.addPage();
        header();
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#213F60')
        .text(l.concepto.replace(/_/g, ' '))
        .moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#25303B')
        .text(`Base: ${visible(l.inicio)} al ${visible(l.fin)}`)
        .text(
          `Promedio mensual: ${q(l.promedio)} - Tiempo: ${l.tiempo}${l.concepto === 'VACACIONES_PENDIENTES' ? ' días' : ' años/fracción'}`,
        )
        .text(`Cálculo: ${l.formula ?? `${l.promedio} × ${l.tiempo}`}`)
        .text(`Importe: ${q(l.monto)} - Exento ISR: ${q(l.exento)} - Gravado: ${q(l.gravado)}`)
        .moveDown();
    }
    if (doc.y > 560) {
      doc.addPage();
      header();
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#365D35')
      .text(`Total de prestaciones: ${q(s.total)}`)
      .moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#25303B')
      .text(`Exento ISR: ${q(s.exento)} - Base gravada: ${q(s.gravado)}`)
      .text('La base gravada se incorpora al cálculo fiscal de nómina.')
      .moveDown();
    if (r.fechaPago)
      doc.text(`Pago registrado: ${visible(r.fechaPago)} - Referencia: ${r.referencia}`).moveDown();
    doc
      .text(`Motivo: ${r.motivo}`)
      .moveDown()
      .fontSize(8)
      .fillColor('#52606D')
      .text(`Motor ${s.versionMotor} - Huella de fuentes: ${s.hash}`, { width: 499 });
    if (firma) bloqueFirma(doc, firma);
  });
}
export function constanciaPdf(
  e: Empleado,
  r: { inicio: string; fin: string },
  filas: { fecha: string; concepto: string; monto: string }[],
  empresa: IdentidadEmpresa,
  hoy: string,
  firma: FirmaDocumento,
) {
  return generarPdf('Constancia de salario', empresa, (doc) => {
    const header = () => {
      cabecera(doc, 'Constancia de salario', empresa.razonSocial);
      doc
        .text(e.nombre)
        .text(`${e.puesto} - ${e.departamento}`)
        .text(`Fecha de ingreso: ${visible(e.ingreso)}`)
        .text(`Ingresos pagados del ${visible(r.inicio)} al ${visible(r.fin)}`)
        .moveDown();
    };
    header();
    doc
      .text(
        'Se hace constar el siguiente historial de ingresos brutos de nóminas cerradas y prestaciones pagadas, según sus fechas de pago.',
      )
      .moveDown();
    for (const f of filas) {
      const texto = `${visible(f.fecha)} - ${f.concepto}`;
      const alto = Math.max(28, doc.heightOfString(texto, { width: 360 }) + 12);
      if (doc.y + alto > 720) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      doc.fontSize(10).text(texto, 48, y, { width: 360 });
      doc.text(q(f.monto), 415, y, { width: 132, align: 'right' });
      doc.y = y + alto;
      doc.x = 48;
    }
    if (doc.y > 640) {
      doc.addPage();
      header();
    }
    const total = filas.reduce((s, f) => s.plus(f.monto), new Decimal(0));
    doc
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#365D35')
      .text(`Total de ingresos: ${q(total.toFixed(2))}`)
      .moveDown();
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#25303B')
      .text(`Emitida el ${visible(hoy)} para los usos que correspondan.`)
      .moveDown(1)
      .fontSize(8)
      .fillColor('#52606D')
      .text('Documento generado desde registros del sistema; no incluye periodos abiertos.');
    bloqueFirma(doc, firma);
  });
}
