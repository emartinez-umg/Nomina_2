import PDFDocument from 'pdfkit';
import { ErrorConflicto } from '../errors/errors.js';
export interface IdentidadEmpresa {
  razonSocial: string;
  nombreComercial: string | null;
  nit: string;
  direccion: string;
  telefono: string | null;
  correo: string | null;
  sitioWeb: string | null;
  logo: Buffer | null;
}
export interface FirmaDocumento {
  idUsuario: number;
  nombre: string;
  cargo: string;
  fecha: string;
}
export function exigirMembrete(e: IdentidadEmpresa | null): IdentidadEmpresa {
  if (
    !e?.razonSocial?.trim() ||
    !e.nit?.trim() ||
    !e.direccion?.trim() ||
    !e.telefono?.trim() ||
    !e.correo?.trim()
  )
    throw new ErrorConflicto(
      'Falta configurar la empresa. Solicita a RH o ADMIN completar Configuración → Configuración de empresa antes de generar PDF.',
    );
  return e;
}
export function validarFirmante(p: { nombre: string; cargo: string } | null) {
  if (!p?.nombre?.trim() || !p.cargo?.trim())
    throw new ErrorConflicto(
      'No puedes aprobar documentos sin nombre completo y cargo. Solicita a ADMIN vincular tu usuario a tu ficha de empleado y a RH completar nombres, apellidos y puesto activo en Personal → Empleados.',
    );
  return p;
}
export function bloqueFirma(doc: PDFKit.PDFDocument, f: FirmaDocumento) {
  validarFirmante(f);
  if (doc.y + 95 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.x = doc.page.margins.left;
  doc.moveDown(1.5).font('Helvetica-Bold').fontSize(11).fillColor('#213F60').text(f.nombre);
  doc.font('Helvetica').fontSize(10).text(f.cargo).text('Recursos Humanos');
  const [fecha, hora] = f.fecha.split(' ');
  doc
    .fontSize(8)
    .fillColor('#52606D')
    .text(`Aprobado el ${fecha!.split('-').reverse().join('/')} ${hora ?? ''}`);
}
export async function generarPdf(
  titulo: string,
  identidad: IdentidadEmpresa | null,
  contenido: (doc: PDFKit.PDFDocument) => void,
  horizontal = false,
) {
  const e = exigirMembrete(identidad);
  const doc = new PDFDocument({
    size: 'A4',
    layout: horizontal ? 'landscape' : 'portrait',
    margins: { top: 156, bottom: 76, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: titulo, Author: e.razonSocial },
  });
  const w = doc.page.width - 96,
    x = e.logo ? 134 : 48,
    ancho = doc.page.width - 48 - x;
  const altoNombre = doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .heightOfString(e.razonSocial, { width: ancho });
  const altoComercial = e.nombreComercial
    ? doc.font('Helvetica').fontSize(10).heightOfString(e.nombreComercial, { width: ancho }) + 4
    : 0;
  const yNit = 30 + altoNombre + altoComercial + 6;
  const yDireccion = Math.max(104, yNit + 20);
  const altoDireccion = doc.font('Helvetica').fontSize(9).heightOfString(e.direccion, { width: w });
  const linea = yDireccion + altoDireccion + 10;
  const margenSuperior = linea + 18;
  const contacto = [e.telefono, e.correo].filter(Boolean).join('  |  ');
  const web = e.sitioWeb ?? e.nombreComercial ?? e.razonSocial;
  const altoContacto = doc.fontSize(8).heightOfString(contacto, { width: w });
  const altoWeb = doc.heightOfString(web, { width: w - 110 });
  const margenInferior = Math.max(76, altoContacto + altoWeb + 35);
  doc.page.margins.top = margenSuperior;
  doc.page.margins.bottom = margenInferior;
  doc.options.margins = { top: margenSuperior, bottom: margenInferior, left: 48, right: 48 };
  doc.x = 48;
  doc.y = margenSuperior;
  const partes: Buffer[] = [];
  const listo = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  try {
    contenido(doc);
    const paginas = doc.bufferedPageRange();
    for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
      doc.switchToPage(i);

      doc.page.margins.bottom = 0;
      doc.save();
      if (e.logo) doc.image(e.logo, 48, 30, { fit: [72, 64], align: 'center', valign: 'center' });

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#213F60')
        .text(e.razonSocial, x, 30, { width: ancho });
      if (e.nombreComercial)
        doc
          .font('Helvetica')
          .fontSize(10)
          .text(e.nombreComercial, x, 30 + altoNombre + 4, { width: ancho });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#25303B')
        .text(`NIT: ${e.nit}`, x, yNit, { width: ancho, lineBreak: false });
      doc.text(e.direccion, 48, yDireccion, { width: w });
      doc
        .moveTo(48, linea)
        .lineTo(doc.page.width - 48, linea)
        .strokeColor('#D7E1E8')
        .stroke();
      const y = doc.page.height - margenInferior + 14;
      doc
        .moveTo(48, y - 8)
        .lineTo(doc.page.width - 48, y - 8)
        .stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#52606D').text(contacto, 48, y, { width: w });
      doc.text(web, 48, y + altoContacto + 4, { width: w - 110 });
      doc.text(`Página ${i + 1} de ${paginas.count}`, doc.page.width - 158, y + altoContacto + 4, {
        width: 110,
        align: 'right',
        lineBreak: false,
      });
      doc.restore();
    }
    doc.end();
  } catch (error) {
    doc.destroy();
    throw error;
  }
  return listo;
}
