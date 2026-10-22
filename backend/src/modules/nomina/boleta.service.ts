import type { Connection } from 'oracledb';
import type { Guardado } from './nomina.repository.js';
import { boletaArchivada } from './pago.repository.js';
import { boletasPdf } from './nomina.exportar.js';
import { esPrestacion, FORMATO_BOLETA, nombreBoleta } from './boleta.pdf.js';
import { conTituloPdf } from '../../shared/pdf/titulo.js';
import { datosBoletas } from './boleta.repository.js';
import { membrete } from '../empresa/empresa.service.js';
import { firmaBoleta } from '../empresa/empresa.repository.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';

export async function pdfBoleta(c: Connection, n: Guardado, enZip = false) {
  const salida = (pdf: Buffer) =>
    enZip || esPrestacion(n) ? conTituloPdf(pdf, nombreBoleta(n, enZip).slice(0, -4)) : pdf;
  const archivada = await boletaArchivada(c, n.id);
  if (archivada && (esPrestacion(n) || archivada.includes(Buffer.from(FORMATO_BOLETA))))
    return salida(archivada);
  const firma = await firmaBoleta(c, n.id);
  if (!firma && ['APROBADO', 'CERRADO'].includes(n.estado))
    throw new ErrorConflicto(
      'La aprobación histórica carece de nombre y cargo verificables. Completa la ficha del aprobador y solicita a ADMIN revisar y reaprobar el periodo.',
    );
  // Una descarga nunca reemplaza el comprobante archivado ni escribe en un periodo cerrado.
  return salida(
    await boletasPdf(
      [n],
      await membrete(c),
      firma ? new Map([[n.id, firma]]) : new Map(),
      await datosBoletas(c, [n]),
    ),
  );
}
