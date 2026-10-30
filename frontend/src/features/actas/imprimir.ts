import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ArchivoActa } from './api';

// Solo recibe el PDF generado por el sistema; jamás inserta texto del acta como HTML.
export async function imprimirActa(archivo: ArchivoActa, ventana: Window) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = workerUrl;
  const carga = getDocument({
    data: Uint8Array.from(atob(archivo.base64), (c) => c.charCodeAt(0)),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    const pdf = await carga.promise;
    if (ventana.closed) return;
    ventana.document.title = `Imprimir ${archivo.nombre}`;
    const estilo = ventana.document.createElement('style');
    estilo.textContent =
      '@page{size:A4;margin:0}body{margin:0;background:white}canvas{display:block;width:210mm;height:297mm;max-width:100%;break-after:page}canvas:last-child{break-after:auto}@media print{canvas{max-width:none}}';
    ventana.document.head.append(estilo);
    ventana.document.body.replaceChildren();
    for (let i = 1; i <= pdf.numPages; i++) {
      if (ventana.closed) return;
      const pagina = await pdf.getPage(i),
        viewport = pagina.getViewport({ scale: 1.6 }),
        canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Acta, página ${i} de ${pdf.numPages}`);
      await pagina.render({ canvas, viewport }).promise;
      if (ventana.closed) return;
      ventana.document.body.append(ventana.document.adoptNode(canvas));
    }
    ventana.focus();
    ventana.print();
  } finally {
    await carga.destroy();
  }
}
