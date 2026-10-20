import { generarPdf, bloqueFirma } from '../../shared/pdf/documento.js';
import type { IdentidadEmpresa, FirmaDocumento } from '../../shared/pdf/documento.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import { variables } from './solicitudes.schemas.js';
export function rellenarPlantilla(contenido: string, datos: Record<string, string | null>) {
  return contenido.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => {
    if (!variables.includes(key as (typeof variables)[number]) || !datos[key]?.trim())
      throw new ErrorConflicto(`Falta completar el dato «${key}» antes de generar el documento.`);
    return datos[key]!;
  });
}
export function solicitudPdf(
  titulo: string,
  texto: string,
  id: number,
  empresa: IdentidadEmpresa,
  firma: FirmaDocumento,
) {
  return generarPdf(titulo, empresa, (doc) => {
    doc.font('Helvetica-Bold').fontSize(19).fillColor('#213F60').text(titulo).moveDown();
    doc.font('Helvetica').fontSize(11).fillColor('#25303B').text(texto, { lineGap: 5 });
    bloqueFirma(doc, firma);
    doc.moveDown().fontSize(8).text(`Solicitud ${id}`);
  });
}
