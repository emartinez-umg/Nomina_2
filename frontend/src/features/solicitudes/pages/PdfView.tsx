import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Documento } from '../api/solicitudes';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { iconos } from '../../../components/ui/icons';
export function PdfView({ documento, onListo }: { documento: Documento; onListo: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pagina, setPagina] = useState(1),
    [paginas, setPaginas] = useState(0),
    [texto, setTexto] = useState(''),
    [error, setError] = useState(''),
    [cargando, setCargando] = useState(true),
    [zoom, setZoom] = useState(false);
  useEffect(() => {
    let activa = true,
      carga: PDFDocumentLoadingTask | undefined,
      render: RenderTask | undefined;
    setCargando(true);
    setError('');
    void (async () => {
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
      if (!activa) return;
      GlobalWorkerOptions.workerSrc = workerUrl;
      carga = getDocument({
        data: Uint8Array.from(atob(documento.base64), (c) => c.charCodeAt(0)),
        useSystemFonts: true,
        isEvalSupported: false,
      });
      const pdf = await carga.promise;
      if (!activa) return;
      setPaginas(pdf.numPages);
      const hoja = await pdf.getPage(pagina);
      if (!activa || !canvas.current) return;
      const viewport = hoja.getViewport({ scale: 1.6 });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      render = hoja.render({ canvas: canvas.current, viewport });
      await render.promise;
      const contenido = await hoja.getTextContent();
      if (!activa) return;
      setTexto(contenido.items.map((i) => ('str' in i ? i.str : '')).join(' '));
      setCargando(false);
      onListo();
    })().catch(() => {
      if (activa) {
        setError('No se pudo mostrar la vista previa. Cierra el detalle y vuelve a abrir el PDF.');
        setCargando(false);
      }
    });
    return () => {
      activa = false;
      render?.cancel();
      void carga?.destroy();
    };
  }, [documento, pagina, onListo]);
  return (
    <div className="my-4" aria-label="Vista previa del documento" aria-busy={cargando}>
      {cargando && <Skeleton lineas={4} />}
      {error && <p role="alert">{error}</p>}
      <div className="overflow-auto max-h-[70vh]">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Documento PDF, página ${pagina} de ${paginas}`}
          style={{ width: zoom ? '200%' : '100%', maxWidth: 'none' }}
          className={`h-auto border border-borde rounded-xl bg-white ${cargando || error ? 'hidden' : ''}`}
        />
      </div>
      {!cargando && !error && (
        <>
          <Button
            icono="buscar"
            variante="secundario"
            className="mt-3"
            onClick={() => setZoom((v) => !v)}
          >
            {zoom ? 'Ajustar al ancho' : 'Ampliar página'}
          </Button>
          <details className="my-3">
            <summary className="cursor-pointer flex items-center gap-2">
              <iconos.documento size={18} aria-hidden="true" />
              Leer texto de esta página
            </summary>
            <p className="my-3 whitespace-pre-wrap">{texto}</p>
          </details>
          <div className="flex flex-wrap gap-3 items-center">
            <Button icono="anterior" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <span>
              Página {pagina} de {paginas}
            </span>
            <Button
              icono="siguiente"
              disabled={pagina >= paginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      <Button
        icono="exportar"
        className="mt-3"
        onClick={() => {
          const bytes = Uint8Array.from(atob(documento.base64), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = documento.nombre;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Descargar PDF
      </Button>
    </div>
  );
}
