import { generarPdf } from './documento.js';
import type { IdentidadEmpresa } from './documento.js';
export interface CredencialTemporal {
  nombre: string;
  usuario: string;
  contrasenaTemporal: string;
}
// Solo memoria: el llamador entrega una vez y nunca persiste el PDF ni la contraseña.
export function credencialesTemporalesPdf(
  empresa: IdentidadEmpresa,
  credenciales: CredencialTemporal[],
) {
  return generarPdf('Credenciales temporales', empresa, (doc) => {
    credenciales.forEach((c, i) => {
      if (i) doc.addPage();
      doc
        .font('Helvetica-Bold')
        .fontSize(19)
        .fillColor('#213F60')
        .text('Credenciales de primer ingreso')
        .moveDown();
      doc.font('Helvetica').fontSize(12).fillColor('#25303B').text(c.nombre).moveDown();
      doc
        .text(`Usuario: ${c.usuario}`)
        .text(`Contraseña temporal: ${c.contrasenaTemporal}`)
        .moveDown();
      doc
        .fontSize(11)
        .text(
          'Ingresa al sistema con estas credenciales. En el primer inicio deberás cambiar la contraseña antes de acceder a tus gestiones.',
        )
        .moveDown();
      doc.text(
        'Usa al menos 10 caracteres: mayúscula, minúscula, número y símbolo. Conserva este documento en privado y elimínalo después del primer ingreso. Si pierdes las credenciales, solicita un restablecimiento a RRHH.',
      );
    });
  });
}
