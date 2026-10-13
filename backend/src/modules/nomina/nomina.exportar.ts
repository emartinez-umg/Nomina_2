import { fechas, vigente } from './nomina.calculo.js';
import PDFDocument from 'pdfkit';
import { zipSync, strToU8 } from 'fflate';
import { Decimal } from 'decimal.js';
import { dinero } from '../../shared/utils/dinero.js';
import { ErrorConflicto } from '../../shared/errors/errors.js';
import type { Entrada, Resultado } from './nomina.types.js';
import type { FilaNomina, Guardado } from './nomina.repository.js';
import type { FormatoIgss } from './nomina.schemas.js';
export interface Snapshot {
  entrada: Entrada;
  resultado: Resultado;
  empresa: { nombre: string; nit: string; direccion: string } | null;
}
export const snapshot = (r: Guardado) => JSON.parse(r.snapshot) as Snapshot;
const visible = (s: string) => s.split('-').reverse().join('/');
const q = (m: string) => {
  const [entero, centavos] = new Decimal(m).toFixed(2).split('.');
  return `Q ${entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${centavos}`;
};
async function pdf(contenido: (doc: PDFKit.PDFDocument) => void, horizontal = false) {
  const doc = new PDFDocument({
      size: 'A4',
      layout: horizontal ? 'landscape' : 'portrait',
      margin: 42,
      bufferPages: true,
      info: { Title: 'Nómina', Author: 'nomina2' },
    }),
    partes: Buffer[] = [];
  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });
  contenido(doc);
  const paginas = doc.bufferedPageRange();
  for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#52606D')
      .text(`Página ${i + 1} de ${paginas.count}`, 42, doc.page.height - 28, {
        width: doc.page.width - 84,
        align: 'right',
        lineBreak: false,
      });
  }
  doc.end();
  return terminado;
}
function encabezado(doc: PDFKit.PDFDocument, titulo: string, empresa: string) {
  doc.fillColor('#213F60').font('Helvetica-Bold').fontSize(18).text(titulo);
  doc.moveDown(0.5).fillColor('#365D35').fontSize(11).text(empresa);
  doc.moveDown().fillColor('#25303B').font('Helvetica').fontSize(10);
}
export function boletasPdf(filas: Guardado[]) {
  return pdf((doc) => {
    filas.forEach((fila, i) => {
      if (i) doc.addPage();
      const s = snapshot(fila),
        e = s.entrada.empleado,
        r = s.resultado;
      const cabecera = () => {
        encabezado(doc, 'Boleta de pago', s.empresa?.nombre ?? 'Nómina');
        doc.text(`${e.codigo} · ${e.nombres} ${e.apellidos}`);
        doc.text(`${e.departamento} · ${e.puesto}`);
        doc.text(`${visible(fila.inicio)} al ${visible(fila.fin)} · Versión ${fila.version}`);
        doc.text(`Salario mensual: ${q(r.salario)} · Días pagados: ${r.dias}`);
        doc.moveDown();
      };
      cabecera();
      if (fila.estado !== 'CERRADO')
        doc
          .fillColor('#8A4617')
          .text('VISTA PREVIA · Periodo pendiente de cierre')
          .fillColor('#25303B')
          .moveDown();
      for (const naturaleza of ['INGRESO', 'DESCUENTO'] as const) {
        doc.x = 42;
        doc
          .font('Helvetica-Bold')
          .fillColor('#213F60')
          .text(naturaleza === 'INGRESO' ? 'Ingresos' : 'Descuentos')
          .moveDown(0.4);
        for (const l of r.lineas.filter((l) => l.concepto.naturaleza === naturaleza)) {
          const alto = Math.max(18, doc.heightOfString(l.descripcion, { width: 365 }) + 8);
          if (doc.y + alto > 715) {
            doc.addPage();
            cabecera();
          }
          const y = doc.y;
          doc.font('Helvetica').fillColor('#25303B').text(l.descripcion, 42, y, { width: 365 });
          doc.text(q(l.monto), 410, y, { width: 100, align: 'right' });
          doc.y = y + alto;
        }
        doc.moveDown(0.4);
      }
      if (doc.y > 625) {
        doc.addPage();
        cabecera();
      }
      doc.x = 42;
      doc
        .font('Helvetica-Bold')
        .text(`Total ingresos: ${q(r.ingresos)}`)
        .text(`Total descuentos: ${q(r.descuentos)}`)
        .fillColor('#365D35')
        .fontSize(15)
        .text(`Neto a recibir: ${q(r.neto)}`)
        .moveDown();
      doc
        .fillColor('#52606D')
        .font('Helvetica')
        .fontSize(9)
        .text(
          `Identificador: ${fila.id} · ${fila.estado}. Generada desde el detalle y las vigencias conservadas del cálculo.`,
        );
    });
  });
}
export function planillaPdf(
  filas: FilaNomina[],
  totales: { ingresos: string; descuentos: string; neto: string; patronal: string },
) {
  return pdf((doc) => {
    const cabecera = () => {
      encabezado(doc, 'Planilla consolidada', 'Nómina');
      const y = doc.y;
      ['Empleado / periodo', 'Ingresos', 'Descuentos', 'Neto', 'Patronal'].forEach((s, i) =>
        doc.font('Helvetica-Bold').text(s, [42, 360, 460, 560, 660][i]!, y, {
          width: i === 0 ? 305 : 90,
          align: i === 0 ? 'left' : 'right',
        }),
      );
      doc.y = y + 24;
    };
    cabecera();
    for (const f of filas) {
      if (doc.y > 500) {
        doc.addPage();
        cabecera();
      }
      const y = doc.y;
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(`${f.empleado}\n${visible(f.inicio)} - ${visible(f.fin)} · ${f.estado}`, 42, y, {
          width: 305,
        });
      [f.ingresos, f.descuentos, f.neto, f.patronal].forEach((v, i) =>
        doc.text(q(v), [360, 460, 560, 660][i]!, y, { width: 90, align: 'right' }),
      );
      doc.y = y + 42;
    }
    if (doc.y > 500) doc.addPage();
    doc.x = 42;
    doc
      .moveDown()
      .font('Helvetica-Bold')
      .text(
        `Totales · Ingresos ${q(totales.ingresos)} · Descuentos ${q(totales.descuentos)} · Neto ${q(totales.neto)} · Patronal ${q(totales.patronal)}`,
      );
  }, true);
}
const xml = (s: unknown) =>
  String(s ?? '')
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32 || ['\t', '\n', '\r'].includes(c))
    .join('')
    .replace(
      /[&<>"']/g,
      (v) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[v]!,
    );
export function excel(filas: (string | number)[][]) {
  const archivos: Record<string, Uint8Array> = {};
  const agregar = (nombre: string, contenido: string) => {
    archivos[nombre] = strToU8(contenido);
  };
  agregar(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  );
  agregar(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  agregar(
    'xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Planilla" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  agregar(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  // Todas las celdas de texto son inlineStr: nombres/referencias nunca se ejecutan como fórmulas.
  agregar(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="12" width="20" customWidth="1"/></cols><sheetData>${filas
      .map(
        (f, i) =>
          `<row r="${i + 1}">${f
            .map((v, j) =>
              i > 0 && j >= 6 && /^\d+(\.\d+)?$/.test(String(v))
                ? `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="n"><v>${xml(v)}</v></c>`
                : `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`,
            )
            .join('')}</row>`,
      )
      .join(
        '',
      )}</sheetData><autoFilter ref="A1:${String.fromCharCode(64 + (filas[0]?.length ?? 1))}${filas.length}"/></worksheet>`,
  );
  return Buffer.from(zipSync(archivos));
}
export const archivo = (contenido: Buffer, nombre: string, tipo: string) => ({
  nombre,
  tipo,
  base64: contenido.toString('base64'),
});
export function reporteIgss(
  filas: Guardado[],
  f: FormatoIgss,
  anio: number,
  mes: number,
  ahora = new Date(),
) {
  const out: string[] = [];
  const linea = (v: unknown[]) => out.push(v.map((v) => String(v ?? '').toUpperCase()).join('|'));
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
  linea([
    f.version,
    visible(hoy),
    f.patrono,
    String(mes).padStart(2, '0'),
    anio,
    f.nombre,
    f.nit,
    f.correo,
    f.pruebas,
  ]);
  out.push('[Centros]');
  for (const c of f.centros)
    linea([
      c.codigo,
      c.nombre,
      c.direccion,
      c.zona,
      c.telefono,
      c.fax,
      c.contacto,
      c.correo,
      c.departamento,
      c.municipio,
      c.actividad,
    ]);
  out.push('[TiposPlanilla]');
  for (const t of f.tipos)
    linea([
      t.codigo,
      t.nombre,
      t.afiliado,
      t.periodo,
      t.departamento,
      t.actividad,
      t.clase,
      t.tiempo,
    ]);
  const inicio = `${anio}-${String(mes).padStart(2, '0')}-01`,
    fin = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  out.push('[Liquidaciones]');
  f.tipos.forEach((t, i) => linea([i + 1, t.codigo, visible(inicio), visible(fin), 'O', '']));
  out.push('[Empleados]');
  const grupos = new Map<number, Guardado[]>();
  for (const n of filas) grupos.set(n.idEmpleado, [...(grupos.get(n.idEmpleado) ?? []), n]);
  const extras: { etiqueta: string; linea: unknown[] }[] = [];
  for (const [id, ns] of grupos) {
    const s = snapshot(ns.at(-1)!),
      e = s.entrada.empleado,
      m = f.empleados.find((v) => v.id === id),
      c = f.centros.find((v) => v.id === e.centro),
      t = f.tipos.find((v) => v.codigo === m?.tipo);
    if (!m || !c || !t || !e.afiliacion)
      throw new ErrorConflicto(
        `Completa afiliación, centro y asignación IGSS del empleado ${e.codigo}.`,
      );
    if (!/^[\d/-]{1,12}$/.test(e.afiliacion) || !/^[\dKk-]{1,20}$/.test(e.nit))
      throw new ErrorConflicto(
        `Revisa afiliación y NIT del empleado ${e.codigo} para el formato IGSS.`,
      );
    const liq = f.tipos.indexOf(t) + 1,
      nombres = [
        m.primerNombre,
        m.otrosNombres,
        m.primerApellido,
        m.segundoApellido,
        m.apellidoCasada,
      ];
    const total = ns.reduce((v, n) => v.plus(snapshot(n).resultado.baseIgss), new Decimal(0)),
      dias = ns.reduce((v, n) => v.plus(snapshot(n).resultado.dias), new Decimal(0));
    let horas = '';
    if (t.tiempo === 'TP') {
      let totalHoras = new Decimal(0);
      for (const n of ns) {
        const entrada = snapshot(n).entrada;
        for (const fecha of fechas(n.inicio, n.fin).filter(
          (d) => d >= e.ingreso && (!e.egreso || d <= e.egreso) && !entrada.feriados.includes(d),
        )) {
          const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay() || 7;
          const horario = vigente(
            entrada.horarios.map((h, i) => ({ ...h, id: i })),
            fecha,
            'horario del reporte IGSS',
          );
          if (
            !horario.dias.includes(dia) ||
            entrada.ausencias.some(
              (a) =>
                a.estado === 'APROBADA' &&
                a.efecto !== 'CON_GOCE' &&
                a.inicio <= fecha &&
                a.fin >= fecha,
            )
          )
            continue;
          const patron = vigente(
            (entrada.jornadas ?? []).filter((j) => j.dia === dia).map((j, i) => ({ ...j, id: i })),
            fecha,
            'horas del horario para tiempo parcial',
          );
          totalHoras = totalHoras.plus(patron.horas);
        }
        totalHoras = totalHoras.plus(
          entrada.horas
            .filter((h) => h.estado === 'APROBADA')
            .reduce((v, h) => v.plus(h.horas), new Decimal(0)),
        );
      }
      horas = dinero(totalHoras);
    }
    linea([
      liq,
      e.afiliacion,
      ...nombres,
      dinero(total),
      e.ingreso >= inicio ? visible(e.ingreso) : '',
      e.egreso && e.egreso <= fin ? visible(e.egreso) : '',
      c.codigo,
      e.nit,
      m.ocupacion,
      m.condicion,
      '',
      m.salario,
      horas,
      t.tiempo,
      dias.toString(),
    ]);
    const ausencias = new Map(
      ns.flatMap((n) => snapshot(n).entrada.ausencias).map((a) => [a.id, a]),
    );
    for (const a of ausencias.values())
      if (a.estado === 'APROBADA' && a.efecto !== 'CON_GOCE')
        extras.push({
          etiqueta: a.efecto === 'SUBSIDIO_IGSS' ? '[Suspendidos]' : '[Licencias]',
          linea: [
            liq,
            e.afiliacion,
            ...nombres,
            visible(a.inicio < inicio ? inicio : a.inicio),
            visible(a.fin > fin ? fin : a.fin),
          ],
        });
  }
  for (const etiqueta of ['[Suspendidos]', '[Licencias]']) {
    out.push(etiqueta);
    for (const e of extras.filter((e) => e.etiqueta === etiqueta)) linea(e.linea);
  }
  out.push(
    '[Juramento]',
    'BAJO MI EXCLUSIVA Y ABSOLUTA RESPONSABILIDAD, DECLARO QUE LA INFORMACION QUE AQUI CONSIGNO ES FIEL Y EXACTA, QUE ESTA PLANILLA INCLUYE A TODOS LOS TRABAJADORES QUE ESTUVIERON A MI SERVICIO Y QUE SUS SALARIOS SON LOS EFECTIVAMENTE DEVENGADOS, DURANTE EL MES ARRIBA INDICADO',
    '[Fin Planilla]',
  );
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guatemala',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(ahora)
    .replace(':', '');
  return archivo(
    Buffer.from(out.join('\r\n') + '\r\n', 'utf8'),
    `${f.patrono}-${anio}${String(mes).padStart(2, '0')}-${hoy.split('-').reverse().join('')}-${hora}.txt`,
    'text/plain;charset=utf-8',
  );
}
