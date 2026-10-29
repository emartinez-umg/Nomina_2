import { ErrorApi } from '../../lib/http';
import { useFormDraft, useDraftValues } from '../../hooks/useFormDraft';
import { FormDraftNotice } from '../../components/forms/FormDraftNotice';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession } from '../../app/session';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Table } from '../../components/ui/Table';
import { DateField, FileField, TextAreaField, FormErrorSummary } from '../../components/forms';
import { FormGrid } from '../../components/forms/FormGrid';
import { useToast } from '../../components/ui/Toast';
import { fechaValida, fechaVisible } from '../../lib/validadores';
import { PdfView } from '../solicitudes/pages/PdfView';
import * as api from './api';
import type { DocumentoExpediente, TipoExpediente, ArchivoExpediente } from './api';

export function ExpedientePanel({ id }: { id: number }) {
  const { usuario } = useSession(),
    cliente = useQueryClient(),
    toast = useToast();
  const admin = usuario?.rol === 'RH' || usuario?.rol === 'ADMIN';
  const [carga, setCarga] = useState<{ tipo: TipoExpediente; actual?: DocumentoExpediente } | null>(
      null,
    ),
    [historia, setHistoria] = useState<TipoExpediente | null>(null),
    [pagina, setPagina] = useState(1),
    [baja, setBaja] = useState<DocumentoExpediente | null>(null),
    [config, setConfig] = useState<TipoExpediente | null>(null),
    [vista, setVista] = useState<ArchivoExpediente | null>(null),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState('');
  const q = useQuery({
    queryKey: ['expedientes', usuario?.idUsuario, id, pagina, historia?.id],
    queryFn: ({ signal }) => api.listar(id, pagina, historia?.id, signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const actualizar = async () => {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: ['expedientes'] }),
      cliente.invalidateQueries({ queryKey: ['empleados'] }),
      cliente.invalidateQueries({ queryKey: ['tablero'] }),
    ]);
  };
  const descargar = async (d: DocumentoExpediente) => {
    if (ocupado) return;
    setOcupado(true);
    setError('');
    try {
      api.guardarArchivo(await api.archivo(d.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const ver = async (d: DocumentoExpediente) => {
    if (ocupado) return;
    setOcupado(true);
    setError('');
    try {
      setVista(await api.archivo(d.id, true));
      setDocumentoVista(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  const [documentoVista, setDocumentoVista] = useState<DocumentoExpediente | null>(null);
  const acciones = (d: DocumentoExpediente) => (
    <div className="flex flex-wrap gap-2">
      <Button
        icono="ver"
        variante="texto"
        disabled={!d.activo || ocupado}
        title={d.activo ? 'Consulta auditada' : 'La versión está dada de baja'}
        onClick={() => void ver(d)}
      >
        Ver
      </Button>
      <Button
        icono="exportar"
        variante="texto"
        disabled={!d.activo || ocupado}
        onClick={() => void descargar(d)}
      >
        Descargar
      </Button>
      {admin && (
        <Button
          icono="eliminar"
          variante="texto"
          disabled={!d.activo || ocupado}
          onClick={() => setBaja(d)}
        >
          Dar de baja
        </Button>
      )}
    </div>
  );
  if (q.isPending) return <Skeleton lineas={6} />;
  if (q.error)
    return (
      <div role="alert">
        <p>{q.error.message}</p>
        <Button icono="actualizar" onClick={() => void q.refetch()}>
          Reintentar expediente
        </Button>
      </div>
    );
  const d = q.data!;
  return (
    <section className="mt-6" aria-label="Expediente digital">
      <div data-tour="expediente-resumen">
        <h2>
          Expediente {d.completos} de {d.requeridos}
        </h2>
        <p className="campo-hint my-3">
          Documentos obligatorios vigentes. PDF, JPG o PNG, máximo {d.maxMb} MB por archivo. Aviso
          de vencimiento: {d.avisoDias} días. Cada consulta y cambio queda auditado.
        </p>
      </div>
      <FormErrorSummary mensajes={[]} mensajeServidor={error} />
      <div data-tour="expediente-tipos" className="grid gap-4 md:grid-cols-2">
        {d.tipos.map((t) => {
          const actual = d.actuales.find((x) => x.idTipo === t.id);
          return (
            <Card key={t.id}>
              <h3>
                {t.nombre}{' '}
                {t.obligatorio && <span className="text-sm text-secundario">· Obligatorio</span>}
              </h3>
              <p className="campo-hint">
                {t.requiereVencimiento ? 'Requiere fecha de vencimiento' : 'Vencimiento opcional'}
              </p>
              {actual ? (
                <>
                  <p className="my-3 break-all">
                    {actual.nombre} · Versión {actual.version}
                  </p>
                  <p
                    className={
                      actual.estado === 'Vencido' || actual.estado === 'Falta vencimiento'
                        ? 'text-peligro'
                        : 'text-secundario'
                    }
                  >
                    {actual.estado}
                    {actual.vencimiento ? ` · ${fechaVisible(actual.vencimiento)}` : ''}
                  </p>
                  {acciones(actual)}
                </>
              ) : (
                <p className="my-3 text-secundario">
                  Sin documento actual.{' '}
                  {admin
                    ? 'Carga el archivo correspondiente.'
                    : 'Solicita a RRHH que complete este documento.'}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {admin && (
                  <Button
                    icono="cargar"
                    onClick={() => setCarga({ tipo: t, ...(actual ? { actual } : {}) })}
                  >
                    {actual ? 'Reemplazar' : 'Cargar'}
                  </Button>
                )}
                <Button
                  icono="historial"
                  variante="secundario"
                  onClick={() => {
                    setPagina(1);
                    setHistoria(t);
                  }}
                >
                  Historial
                </Button>
                {admin && (
                  <Button icono="configuracion" variante="texto" onClick={() => setConfig(t)}>
                    Configurar tipo
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {carga && (
        <Cargar
          id={id}
          tipo={carga.tipo}
          actual={carga.actual}
          maxMb={d.maxMb}
          hoy={d.hoy}
          cerrar={() => setCarga(null)}
          guardado={async () => {
            await actualizar();
            toast('Archivo guardado y auditado.');
            setCarga(null);
          }}
        />
      )}
      {historia && (
        <Modal
          abierto
          titulo={`Historial · ${historia.nombre}`}
          onCerrar={() => {
            setHistoria(null);
            setPagina(1);
          }}
        >
          <Table
            columnas={[
              {
                id: 'version',
                titulo: 'Versión',
                render: (x: DocumentoExpediente) => `${x.version}${x.actual ? ' · Actual' : ''}`,
              },
              {
                id: 'nombre',
                titulo: 'Archivo',
                render: (x: DocumentoExpediente) => (
                  <>
                    <p className="break-all">{x.nombre}</p>
                    <p>
                      {x.activo ? x.estado : 'Baja'} · {fechaVisible(x.creado.slice(0, 10))}
                    </p>
                    {x.vencimiento && <p>Vence: {fechaVisible(x.vencimiento)}</p>}
                    {x.motivoBaja && <p>Motivo: {x.motivoBaja}</p>}
                    <details>
                      <summary>Integridad SHA-256</summary>
                      <code className="break-all">{x.hash}</code>
                    </details>
                  </>
                ),
              },
              { id: 'acciones', titulo: 'Acciones', render: acciones },
            ]}
            filas={d.historial.registros}
            clave={(x) => x.id}
            total={d.historial.total}
            pagina={pagina}
            limite={20}
            orden={{ campo: '', direccion: 'desc' }}
            onOrden={() => {}}
            onPagina={setPagina}
          />
        </Modal>
      )}
      {baja && (
        <Motivo
          registro={`baja-${baja.id}`}
          titulo={`Dar de baja versión ${baja.version}`}
          descripcion={`${baja.nombre}. Se conservará el archivo y su historial, pero esta versión dejará de estar disponible. Las versiones anteriores no se reactivan.`}
          cerrar={() => setBaja(null)}
          confirmar={async (motivo) => {
            await api.baja(baja.id, motivo);
            await actualizar();
            toast('Baja registrada con motivo.');
            setBaja(null);
          }}
        />
      )}
      {config && (
        <Configurar
          tipo={config}
          cerrar={() => setConfig(null)}
          guardar={async (t, motivo) => {
            await api.configurarTipo(t, motivo);
            await actualizar();
            toast('Tipo actualizado y auditado.');
            setConfig(null);
          }}
        />
      )}
      {vista && (
        <Modal
          abierto
          titulo="Vista previa del expediente"
          onCerrar={() => {
            setVista(null);
            setDocumentoVista(null);
          }}
        >
          <div data-tour="expediente-vista">
            {vista.tipo === 'application/pdf' ? (
              <PdfView
                documento={vista}
                onListo={listo}
                onDescargar={() => {
                  if (documentoVista) void descargar(documentoVista);
                }}
              />
            ) : (
              <Imagen
                archivo={vista}
                descargar={() => {
                  if (documentoVista) void descargar(documentoVista);
                }}
              />
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
const listo = () => {};
function Imagen({ archivo, descargar }: { archivo: ArchivoExpediente; descargar: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    const u = URL.createObjectURL(api.blobDe(archivo));
    setError(false);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [archivo]);
  return (
    <>
      <img
        src={url}
        alt={`Documento: ${archivo.nombre}`}
        onError={() => setError(true)}
        className="my-4 max-h-[65vh] max-w-full object-contain"
      />
      {error && (
        <p role="alert">
          No se pudo mostrar esta imagen. Descarga el original o solicita a RRHH que revise el
          archivo.
        </p>
      )}
      <Button icono="exportar" onClick={descargar}>
        Descargar imagen
      </Button>
    </>
  );
}
const cargaSchema = z.object({
  vencimiento: z.string().refine((v) => !v || fechaValida(v), 'Ingresa una fecha válida.'),
});
function Cargar({
  id,
  tipo,
  actual,
  maxMb,
  hoy,
  cerrar,
  guardado,
}: {
  id: number;
  tipo: TipoExpediente;
  actual?: DocumentoExpediente | undefined;
  maxMb: number;
  hoy: string;
  cerrar: () => void;
  guardado: () => Promise<void>;
}) {
  const [archivo, setArchivo] = useState<File | null>(null),
    [error, setError] = useState(''),
    [progreso, setProgreso] = useState(0),
    [ocupado, setOcupado] = useState(false);
  const form = useForm({
    resolver: zodResolver(cargaSchema),
    defaultValues: { vencimiento: '' },
    mode: 'onBlur',
  });
  const draft = useFormDraft(`expediente-carga-${id}-${tipo.id}`, actual?.id, {
    form,
    version: 1,
    alDescartar: () => {
      setArchivo(null);
      setError('');
    },
  });
  const vencimiento = form.watch('vencimiento');
  const elegir = (files: ArrayLike<File> | null) => {
    setError('');
    if (!files || files.length !== 1) {
      setError('Selecciona un solo archivo.');
      return;
    }
    const f = files[0]!;
    if (!f.size || f.size > maxMb * 1024 * 1024) {
      setArchivo(null);
      setError(`El archivo debe tener contenido y no superar ${maxMb} MB.`);
      return;
    }
    if (
      !['application/pdf', 'image/jpeg', 'image/png'].includes(f.type) ||
      !/\.(pdf|jpe?g|png)$/i.test(f.name)
    ) {
      setArchivo(null);
      setError('Selecciona un PDF, JPG o PNG. El servidor comprobará su contenido.');
      return;
    }
    setArchivo(f);
  };
  return (
    <Modal
      abierto
      titulo={`${actual ? 'Reemplazar' : 'Cargar'} · ${tipo.nombre}`}
      onCerrar={() => {
        if (!ocupado) cerrar();
      }}
    >
      <FormDraftNotice draft={draft} />
      <form
        noValidate
        onSubmit={form.handleSubmit(async ({ vencimiento }) => {
          if (ocupado) return;
          if (!archivo) {
            setError('Selecciona el archivo antes de guardar.');
            return;
          }
          if (tipo.requiereVencimiento && !vencimiento) {
            form.setError('vencimiento', {
              message: 'Este documento requiere fecha de vencimiento.',
            });
            return;
          }
          setOcupado(true);
          setError('');
          try {
            await api.cargar(id, tipo.id, actual?.id, vencimiento, archivo, setProgreso);
            draft.limpiar();
            await guardado();
          } catch (e) {
            if (e instanceof ErrorApi && e.campos?.vencimiento)
              form.setError('vencimiento', { message: e.campos.vencimiento.join(' ') });
            setError(
              e instanceof ErrorApi && e.campos?.archivo
                ? e.campos.archivo.join(' ')
                : (e as Error).message,
            );
          } finally {
            setOcupado(false);
          }
        })}
      >
        <div data-tour="expediente-carga">
          <p className="my-4">
            {actual
              ? `Se conservará la versión ${actual.version} en el historial.`
              : 'El archivo se guardará en el expediente privado.'}
          </p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!ocupado) elegir(e.dataTransfer.files);
            }}
            className="rounded-xl border-2 border-dashed border-borde p-6 my-4"
          >
            <p>Arrastra un archivo aquí o selecciónalo.</p>
            <FileField
              name="archivo"
              label="Archivo del expediente"
              hint={`Un PDF, JPG o PNG, hasta ${maxMb} MB. El archivo no se guarda en borradores.`}
              accept="application/pdf,image/jpeg,image/png"
              maxBytes={maxMb * 1024 * 1024}
              onValueChange={(f) => elegir(f ? [f] : null)}
              required
              disabled={ocupado}
            />
            {archivo && (
              <p className="break-all">
                Seleccionado: {archivo.name} ({Math.ceil(archivo.size / 1024)} KB)
              </p>
            )}
          </div>
          <FormGrid>
            <DateField
              name="vencimiento"
              label="Fecha de vencimiento"
              hint="dd/mm/aaaa. Usa la fecha impresa en el documento. Una fecha pasada se conserva como antecedente vencido."
              value={vencimiento}
              onValueChange={(v) =>
                form.setValue('vencimiento', v, { shouldValidate: true, shouldDirty: true })
              }
              required={tipo.requiereVencimiento}
              error={form.formState.errors.vencimiento?.message}
              disabled={ocupado}
            />
          </FormGrid>
          {vencimiento && vencimiento < hoy && (
            <p className="alerta my-3">
              El documento ya está vencido y no completará el expediente.
            </p>
          )}
          {ocupado && (
            <div role="status">
              <label htmlFor="progreso-expediente">
                {progreso < 100 ? `Cargando ${progreso}%` : 'Validando y guardando…'}
              </label>
              <progress id="progreso-expediente" value={progreso} max={100} className="w-full" />
            </div>
          )}
          <FormErrorSummary mensajes={[]} mensajeServidor={error} />
          <div className="my-5 flex flex-wrap justify-end gap-3">
            <Button
              icono="cancelar"
              variante="secundario"
              disabled={ocupado}
              onClick={cerrar}
              cancelarFormulario
            >
              Cancelar
            </Button>
            <Button type="submit" icono="guardar" cargando={ocupado}>
              Guardar archivo
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
function Motivo({
  registro,
  titulo,
  descripcion,
  cerrar,
  confirmar,
  tipo,
}: {
  registro: string;
  titulo: string;
  descripcion: string;
  cerrar: () => void;
  confirmar: (motivo: string, tipo?: TipoExpediente) => Promise<void>;
  tipo?: TipoExpediente;
}) {
  const { campo, draft } = useDraftValues(
    'expediente-motivo',
    registro,
    {
      motivo: '',
      obligatorio: tipo?.obligatorio ?? false,
      requiereVencimiento: tipo?.requiereVencimiento ?? false,
    },
    true,
  );
  const [motivo, setMotivo] = campo('motivo');
  const [obligatorio, setObligatorio] = campo('obligatorio');
  const [requiereVencimiento, setRequiereVencimiento] = campo('requiereVencimiento');
  const [confirmado, setConfirmado] = useState(false),
    [error, setError] = useState(''),
    [ocupado, setOcupado] = useState(false);
  useEffect(() => setConfirmado(false), [motivo, obligatorio, requiereVencimiento]);
  return (
    <Modal
      abierto
      titulo={titulo}
      onCerrar={() => {
        if (!ocupado) cerrar();
      }}
    >
      <FormDraftNotice draft={draft} />
      <div data-tour="expediente-motivo">
        <p className="my-4">{descripcion}</p>
        {tipo && (
          <>
            <p>
              Obligatorio: {tipo.obligatorio ? 'Sí' : 'No'} → {obligatorio ? 'Sí' : 'No'}. Requiere
              vencimiento: {tipo.requiereVencimiento ? 'Sí' : 'No'} →{' '}
              {requiereVencimiento ? 'Sí' : 'No'}.
            </p>
            <label className="flex gap-2 my-3">
              <input
                type="checkbox"
                checked={obligatorio}
                onChange={(e) => setObligatorio(e.target.checked)}
                disabled={ocupado}
              />
              Obligatorio
            </label>
            <label className="flex gap-2 my-3">
              <input
                type="checkbox"
                checked={requiereVencimiento}
                onChange={(e) => setRequiereVencimiento(e.target.checked)}
                disabled={ocupado}
              />
              Requiere vencimiento
            </label>
          </>
        )}
        <TextAreaField
          name="motivo"
          label="Motivo"
          hint="Explica la decisión con 5 a 500 caracteres. No incluyas el contenido de documentos personales."
          value={motivo}
          onValueChange={setMotivo}
          maxLength={500}
          required
          disabled={ocupado}
        />
        <label className="flex items-center gap-2 my-4">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
            disabled={ocupado}
          />
          Confirmo el cambio indicado
        </label>
        <FormErrorSummary mensajes={[]} mensajeServidor={error} />
        <div className="flex gap-3 my-4 justify-end">
          <Button
            icono="cancelar"
            variante="secundario"
            disabled={ocupado}
            onClick={cerrar}
            cancelarFormulario
          >
            Cancelar
          </Button>
          <Button
            icono="aprobar"
            cargando={ocupado}
            disabled={!confirmado || motivo.trim().length < 5}
            onClick={() => {
              setOcupado(true);
              setError('');
              void confirmar(
                motivo.trim(),
                tipo ? { ...tipo, obligatorio, requiereVencimiento } : undefined,
              )
                .then(() => draft.limpiar())
                .catch((e) => setError((e as Error).message))
                .finally(() => setOcupado(false));
            }}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function Configurar({
  tipo,
  cerrar,
  guardar,
}: {
  tipo: TipoExpediente;
  cerrar: () => void;
  guardar: (tipo: TipoExpediente, motivo: string) => Promise<void>;
}) {
  return (
    <Motivo
      registro={`tipo-${tipo.id}`}
      tipo={tipo}
      titulo={`Configurar · ${tipo.nombre}`}
      descripcion="Estos requisitos afectan todos los expedientes. Revisa los valores anteriores y nuevos antes de confirmar."
      cerrar={cerrar}
      confirmar={(motivo, nuevo) => guardar(nuevo!, motivo)}
    />
  );
}

export function MiExpediente() {
  const { usuario } = useSession();
  const q = useQuery({
    queryKey: ['expedientes', 'mio', usuario?.idUsuario],
    queryFn: ({ signal }) => api.propio(signal),
    gcTime: 0,
  });
  return q.isPending ? (
    <Skeleton lineas={4} />
  ) : q.error ? (
    <p role="alert">{q.error.message}</p>
  ) : (
    <ExpedientePanel id={q.data!.id} />
  );
}
