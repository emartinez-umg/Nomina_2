// Actualización incremental de metadatos de nuestros PDFKit: conserva páginas y comprobante original.
export function conTituloPdf(pdf: Buffer, titulo: string) {
  const fuente = pdf.toString('latin1');
  const trailer = /trailer\s*(<<[\s\S]*?>>)\s*startxref\s*(\d+)\s*%%EOF\s*$/.exec(fuente);
  const raiz = trailer?.[1]?.match(/\/Root\s+(\d+\s+\d+\s+R)/)?.[1];
  const info = trailer?.[1]?.match(/\/Info\s+(\d+)\s+0\s+R/)?.[1];
  const size = Number(trailer?.[1]?.match(/\/Size\s+(\d+)/)?.[1]);
  const diccionario = info
    ? new RegExp(`(?:^|\\n)${info} 0 obj\\s*(<<[\\s\\S]*?>>)\\s*endobj`).exec(fuente)?.[1]
    : undefined;
  if (!trailer || !raiz || !size || !diccionario || !/\/Title\s+\d+\s+0\s+R/.test(diccionario))
    throw new Error('No se pudo actualizar el título del PDF generado.');
  const utf16 = Buffer.from(titulo, 'utf16le').swap16().toString('hex');
  const nuevo = diccionario.replace(/\/Title\s+\d+\s+0\s+R/, `/Title <feff${utf16}>`);
  const objeto = `\n${size} 0 obj\n${nuevo}\nendobj\n`;
  const offset = pdf.length + 1;
  const xref = pdf.length + Buffer.byteLength(objeto, 'latin1');
  return Buffer.concat([
    pdf,
    Buffer.from(
      `${objeto}xref\n0 1\n0000000000 65535 f \n${size} 1\n${String(offset).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${size + 1} /Root ${raiz} /Info ${size} 0 R /Prev ${trailer[2]} >>\nstartxref\n${xref}\n%%EOF\n`,
      'latin1',
    ),
  ]);
}
