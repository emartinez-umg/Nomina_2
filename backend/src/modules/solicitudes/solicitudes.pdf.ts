import PDFDocument from 'pdfkit';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import { variables } from './solicitudes.schemas.js';
export function rellenarPlantilla(contenido: string, datos: Record<string, string | null>) {
  return contenido.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => {
    if (!variables.includes(key as (typeof variables)[number]) || !datos[key]?.trim())
      throw new ErrorConflicto(`Falta completar el dato «${key}» antes de generar el documento.`);
    return datos[key]!;
  });
}
export function solicitudPdf(titulo: string, texto: string, id: number, empresa: string) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 54,
    bufferPages: true,
    info: { Title: titulo, Author: empresa },
  });
  const partes: Buffer[] = [];
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#1d395e').text(titulo).moveDown(0.6);
  doc.fontSize(11).fillColor('#28622a').text(empresa).moveDown(1.4);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#25303B')
    .text(texto, { lineGap: 5, align: 'left' });
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#576573')
      .text(`Solicitud ${id}  |  Página ${i + 1} de ${paginas.count}`, 54, doc.page.height - 30, {
        width: 487,
        align: 'right',
        lineBreak: false,
      });
  }
  doc.end();
  return listo;
}
