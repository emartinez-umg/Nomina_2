import { generarPdf, bloqueFirma } from '../../shared/pdf/documento.js';
import type { IdentidadEmpresa, FirmaDocumento } from '../../shared/pdf/documento.js';
export function actaPdf(
  codigo: string,
  titulo: string,
  texto: string,
  empresa: IdentidadEmpresa,
  firma: FirmaDocumento,
) {
  return generarPdf(`Acta ${codigo}`, empresa, (doc) => {
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#213F60').text(titulo).moveDown();
    doc.font('Helvetica').fontSize(10).fillColor('#25303B').text(texto, { lineGap: 4 });
    bloqueFirma(doc, firma);
    if (doc.y + 90 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc
      .moveDown(2)
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#25303B')
      .text('________________________________________')
      .text('Recibí conforme')
      .fontSize(9)
      .text('Firma del empleado y fecha de recepción');
  });
}
