import { imprimirActa } from './imprimir';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/session';
import { useTituloRegistro } from '../../app/titulos';
import { useDraftValues } from '../../hooks/useFormDraft';
import { accionActaSchema } from '../../../../backend/src/shared/actas/modelo';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { EstadoBadge } from '../../components/ui/EstadoBadge';
import { FormDraftNotice } from '../../components/forms/FormDraftNotice';
import { DateField, FileField, TextAreaField, FormErrorSummary } from '../../components/forms';
import { useToast } from '../../components/ui/Toast';
import { usePageHelp } from '../../components/help/HelpProvider';
import { fechaVisible } from '../../lib/validadores';
import { guardarArchivo, blobDe } from '../expedientes/api';
import { PdfView } from '../solicitudes/pages/PdfView';
import { ayudaActas } from './help/pasos';
import * as api from './api';
export function ActaDetallePage() {
  const id = Number(useParams().id),
    { usuario } = useSession(),
    nav = useNavigate(),
    cliente = useQueryClient(),
    [accion, setAccion] = useState<'EMITIR' | 'NEGATIVA' | 'ANULAR' | 'EVIDENCIA' | 'FIRMA' | null>(
      null,
    ),
    [vista, setVista] = useState<api.ArchivoActa | null>(null),
    [error, setError] = useState(''),
    [ocupado, setOcupado] = useState(false);
  const admin = usuario?.rol !== 'EMPLEADO';
  usePageHelp(ayudaActas(!admin), usuario?.rol);
  const q = useQuery({
    queryKey: ['actas', usuario?.idUsuario, 'detalle', id],
    queryFn: ({ signal }) => api.detalle(id, signal),
    retry: false,
    gcTime: 0,
  });
  const r = useQuery({
    queryKey: ['actas', usuario?.idUsuario, 'reglas'],
    queryFn: ({ signal }) => api.reglas(signal),
    enabled: admin,
  });
  useTituloRegistro(q.data?.codigo);
  const [origenVista, setOrigenVista] = useState({ idArchivo: id, adjunto: false });
  const listo = useCallback(() => {}, []);
  const actualizar = async () => {
    setAccion(null);
    await Promise.all([
      cliente.invalidateQueries({ queryKey: ['actas'] }),
      cliente.invalidateQueries({ queryKey: ['tablero'] }),
      cliente.invalidateQueries({ queryKey: ['novedades'] }),
    ]);
  };
  useEffect(() => {
    if (q.error) setVista(null);
  }, [q.error]);
  const archivo = async (idArchivo: number, adjunto = false, ver = false, imprimir = false) => {
    if (ocupado) return;
    setOcupado(true);
    setError('');
    const ventana = imprimir ? window.open('', '_blank') : null;
    try {
      const d = await api.archivo(idArchivo, adjunto, ver);
      if (ventana) {
        await imprimirActa(d, ventana);
      } else if (imprimir) {
        guardarArchivo(d);
        setError('El navegador bloqueó la ventana. Abre el PDF descargado y usa Imprimir.');
      } else if (ver) {
        setOrigenVista({ idArchivo, adjunto });
        setVista(d);
      } else guardarArchivo(d);
    } catch (e) {
      ventana?.close();
      setError((e as Error).message);
      setVista(null);
    } finally {
      setOcupado(false);
    }
  };
  if (q.isPending) return <Skeleton lineas={8} />;
  if (q.error)
    return (
      <div role="alert">
        <p>{q.error.message}</p>
        <Button icono="actualizar" onClick={() => void q.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  const d = q.data!;
  return (
    <>
      <h1>Acta {d.codigo}</h1>
      <div className="flex flex-wrap gap-3 my-4" data-tour="actas-acciones">
        <EstadoBadge estado={d.estado} />
        <Button
          icono="anterior"
          variante="secundario"
          onClick={() => nav(admin ? '/actas' : '/mis-gestiones/actas')}
        >
          Volver
        </Button>
        {admin && (
          <>
            <Button
              icono="editar"
              disabled={d.estado !== 'BORRADOR'}
              title={
                d.estado === 'BORRADOR'
                  ? 'Editar borrador'
                  : 'El contenido queda bloqueado después de emitir.'
              }
              onClick={() => nav(`/actas/${id}/editar`)}
            >
              Editar
            </Button>
            {d.estado === 'BORRADOR' && (
              <Button icono="aprobar" disabled={!r.data} onClick={() => setAccion('EMITIR')}>
                Emitir acta
              </Button>
            )}
            {d.estado === 'EMITIDA' && (
              <>
                <Button icono="cargar" disabled={!r.data} onClick={() => setAccion('FIRMA')}>
                  Adjuntar firma
                </Button>
                <Button icono="rechazar" onClick={() => setAccion('NEGATIVA')}>
                  Se negó a firmar
                </Button>
              </>
            )}
            {['EMITIDA', 'FIRMADA', 'SE_NEGO_A_FIRMAR'].includes(d.estado) && (
              <Button icono="cancelar" variante="peligro" onClick={() => setAccion('ANULAR')}>
                Anular acta
              </Button>
            )}
          </>
        )}
        {d.emitidaEn && (
          <>
            <Button icono="ver" disabled={ocupado} onClick={() => void archivo(id, false, true)}>
              Ver PDF
            </Button>
            <Button
              icono="imprimir"
              disabled={ocupado}
              onClick={() => void archivo(id, false, false, true)}
            >
              Imprimir PDF
            </Button>
            <Button icono="exportar" disabled={ocupado} onClick={() => void archivo(id)}>
              Descargar PDF
            </Button>
          </>
        )}
      </div>
      {r.error && admin && <p role="alert">{r.error.message}</p>}
      {error && <p role="alert">{error}</p>}
      <Card>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4" data-tour="actas-hechos">
          {[
            ['Empleado', d.empleado],
            ['Departamento', d.departamento],
            ['Tipo', d.tipo],
            ['Gravedad', d.gravedad.toLocaleLowerCase('es-GT')],
            ['Fecha del hecho', fechaVisible(d.fechaHecho)],
            ['Lugar', d.lugar],
            ['Descripción de los hechos', d.descripcion],
            ['Testigos', d.testigos || 'Sin testigos declarados'],
            ['Norma aplicada', d.norma],
            ['Medida adoptada', d.medida],
            ['Descargos', d.descargos || 'Sin descargos registrados'],
            ['Días de suspensión', String(d.diasSuspension)],
          ].map(([label, valor]) => (
            <div
              key={label}
              className={
                [
                  'Descripción de los hechos',
                  'Testigos',
                  'Norma aplicada',
                  'Medida adoptada',
                  'Descargos',
                ].includes(label!)
                  ? 'md:col-span-2'
                  : ''
              }
            >
              <dt className="text-sm text-secundario">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">{valor}</dd>
            </div>
          ))}
        </dl>
        {d.emisorNombre && (
          <p className="my-4">
            Emitida por {d.emisorNombre}, {d.emisorCargo}, el{' '}
            {d.emitidaEn?.split(' ')[0]?.split('-').reverse().join('/')}.
          </p>
        )}
        {d.motivoAnulacion && (
          <p className="alerta my-4">
            Anulada: {d.motivoAnulacion}. Se conserva el PDF emitido como antecedente.
          </p>
        )}
        {d.idAusencia && (
          <div className="alerta my-4" data-tour="actas-suspension">
            Ausencia sin goce vinculada. Anular el acta conserva la ausencia y los pagos existentes;
            RH debe revisarlos en Novedades.
            {admin && (
              <Button
                icono="ver"
                variante="texto"
                onClick={() => nav(`/novedades/ausencias/${d.idAusencia}`)}
              >
                Consultar ausencia
              </Button>
            )}
          </div>
        )}
        <section data-tour="actas-adjuntos" className="my-5">
          <h2>Adjuntos</h2>
          {admin && d.estado === 'BORRADOR' && (
            <Button
              icono="cargar"
              className="my-3"
              disabled={!r.data}
              onClick={() => setAccion('EVIDENCIA')}
            >
              Adjuntar evidencia
            </Button>
          )}
          {!d.adjuntos.length && (
            <p>
              No hay adjuntos.{' '}
              {admin && d.estado === 'BORRADOR' ? 'Adjunta las evidencias antes de emitir.' : ''}
            </p>
          )}
          {d.adjuntos.map((a) => (
            <article key={a.id} className="my-3 flex flex-wrap items-center gap-3">
              <p>
                {a.nombre} · {a.clase === 'FIRMA' ? 'Escaneo firmado' : 'Evidencia'} ·{' '}
                {Math.ceil(a.tamano / 1024)} KB
              </p>
              <Button
                icono="ver"
                variante="texto"
                disabled={ocupado}
                onClick={() => void archivo(a.id, true, true)}
              >
                Ver {a.nombre}
              </Button>
              <Button
                icono="exportar"
                variante="texto"
                disabled={ocupado}
                onClick={() => void archivo(a.id, true)}
              >
                Descargar {a.nombre}
              </Button>
            </article>
          ))}
        </section>
        <section className="my-5">
          <h2>Historial de estados</h2>
          <ol>
            {d.historial.map((h) => (
              <li key={h.id} className="my-3">
                <EstadoBadge estado={h.estado} /> · {h.actor} ·{' '}
                {h.fecha.split(' ')[0]?.split('-').reverse().join('/')} {h.fecha.split(' ')[1]}
                {h.motivo && <p className="whitespace-pre-wrap">Motivo: {h.motivo}</p>}
                {h.testigos && (
                  <p className="whitespace-pre-wrap">Testigos de la negativa: {h.testigos}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      </Card>
      {accion &&
        (accion === 'EVIDENCIA' || accion === 'FIRMA' ? (
          <CargaActa
            d={d}
            maxMb={r.data!.maxMb}
            clase={accion}
            cerrar={() => setAccion(null)}
            hecho={actualizar}
          />
        ) : (
          <AccionActa
            d={d}
            accion={accion}
            hoy={r.data?.hoy ?? ''}
            cerrar={() => setAccion(null)}
            hecho={actualizar}
          />
        ))}
      {vista && (
        <Modal abierto titulo={vista.nombre} onCerrar={() => setVista(null)}>
          {vista.tipo === 'application/pdf' ? (
            <PdfView
              documento={vista}
              onListo={listo}
              onDescargar={() => {
                setVista(null);
                void archivo(origenVista.idArchivo, origenVista.adjunto);
              }}
            />
          ) : (
            <Imagen a={vista} />
          )}
        </Modal>
      )}
    </>
  );
}
function Imagen({ a }: { a: api.ArchivoActa }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blobDe(a));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [a]);
  return <img src={url} alt={a.nombre} className="max-w-full my-4" />;
}
function AccionActa({
  d,
  accion,
  hoy,
  cerrar,
  hecho,
}: {
  d: api.Acta;
  accion: 'EMITIR' | 'NEGATIVA' | 'ANULAR';
  hoy: string;
  cerrar: () => void;
  hecho: () => Promise<void>;
}) {
  const [confirmado, setConfirmado] = useState(false),
    [registrar, setRegistrar] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(''),
    toast = useToast();
  const {
    valores: v,
    campo,
    draft,
  } = useDraftValues(
    `acta-${accion.toLowerCase()}`,
    d.id,
    { motivo: '', testigos: '', fechaInicio: hoy },
    true,
    {
      alDescartar: () => {
        setConfirmado(false);
        setRegistrar(false);
        setError('');
      },
    },
  );
  const fin = new Date(v.fechaInicio + 'T00:00:00Z');
  fin.setUTCDate(fin.getUTCDate() + d.diasSuspension - 1);
  const titulo =
    accion === 'EMITIR'
      ? 'Emitir acta'
      : accion === 'NEGATIVA'
        ? 'Registrar negativa de firma'
        : 'Anular acta';
  return (
    <Modal
      abierto
      titulo={titulo}
      onCerrar={() => {
        if (!ocupado) cerrar();
      }}
    >
      <FormDraftNotice draft={draft} />
      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          if (ocupado) return;
          setError('');
          const q = accionActaSchema.safeParse({
            accion,
            version: d.version,
            confirmado,
            ...(accion === 'ANULAR' ? { motivo: v.motivo } : {}),
            ...(accion === 'NEGATIVA' ? { testigos: v.testigos } : {}),
            registrarAusencia: registrar,
            ...(registrar ? { fechaInicio: v.fechaInicio } : {}),
          });
          if (!q.success) {
            setError(q.error.issues.map((x) => x.message).join(' '));
            return;
          }
          setOcupado(true);
          void api
            .accion(d.id, q.data)
            .then(async () => {
              draft.limpiar();
              toast('Estado actualizado y auditado.');
              await hecho();
            })
            .catch((e: Error) => {
              setError(e.message);
              setConfirmado(false);
            })
            .finally(() => setOcupado(false));
        }}
      >
        <p className="my-4">
          {accion === 'EMITIR'
            ? `Emite ${d.codigo}: el contenido no podrá editarse. Se generará el PDF y se notificará al empleado.`
            : accion === 'NEGATIVA'
              ? 'Identifica a los testigos presentes; se conserva el acta y su documento original.'
              : `Anula ${d.codigo} con trazabilidad. El PDF, los adjuntos y la ausencia vinculada se conservan.`}
        </p>
        {accion === 'EMITIR' && d.diasSuspension > 0 && (
          <div data-tour="actas-suspension">
            <p className="alerta my-3">
              Suspensión de {d.diasSuspension} día(s). Revisa la medida con RH.
            </p>
            <label className="flex gap-2 my-3">
              <input
                type="checkbox"
                checked={registrar}
                disabled={ocupado}
                onChange={(e) => {
                  setRegistrar(e.target.checked);
                  setConfirmado(false);
                }}
              />
              Registrar también la ausencia sin goce para nómina
            </label>
            {registrar && (
              <>
                <DateField
                  name="fechaInicio"
                  label="Inicio de la suspensión"
                  required
                  hint="Días calendario inclusivos; no anterior al hecho. Se validan traslapes, salario y periodos abiertos."
                  value={v.fechaInicio}
                  onValueChange={campo('fechaInicio')[1]}
                  min={d.fechaHecho}
                />
                <p className="my-3">
                  Rango: {fechaVisible(v.fechaInicio)} al{' '}
                  {Number.isNaN(fin.getTime())
                    ? 'Selecciona una fecha válida'
                    : fechaVisible(fin.toISOString().slice(0, 10))}
                  . Se creará una ausencia aprobada de {d.diasSuspension} día(s).
                </p>
              </>
            )}
          </div>
        )}
        {accion === 'NEGATIVA' && (
          <TextAreaField
            name="testigos"
            label="Testigos de la negativa"
            hint="Identifica a las personas presentes, de 5 a 1,000 caracteres."
            required
            maxLength={1000}
            value={v.testigos}
            onValueChange={campo('testigos')[1]}
            disabled={ocupado}
          />
        )}
        {accion === 'ANULAR' && (
          <TextAreaField
            name="motivo"
            label="Motivo de anulación"
            hint="De 5 a 500 caracteres. Se conserva con tu usuario y fecha."
            required
            maxLength={500}
            value={v.motivo}
            onValueChange={campo('motivo')[1]}
            disabled={ocupado}
          />
        )}
        <label className="flex gap-2 my-4">
          <input
            type="checkbox"
            checked={confirmado}
            disabled={ocupado}
            onChange={(e) => setConfirmado(e.target.checked)}
          />
          Confirmo que revisé el acta y esta acción
          {registrar ? ' y autorizo registrar la ausencia sin goce' : ''}.
        </label>
        <FormErrorSummary mensajes={[]} mensajeServidor={error} />
        <div className="flex gap-3 my-4">
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
            variante={accion === 'ANULAR' ? 'peligro' : 'primario'}
            type="submit"
            disabled={!confirmado}
            cargando={ocupado}
          >
            {titulo}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function CargaActa({
  d,
  maxMb,
  clase,
  cerrar,
  hecho,
}: {
  d: api.Acta;
  maxMb: number;
  clase: 'EVIDENCIA' | 'FIRMA';
  cerrar: () => void;
  hecho: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [confirmado, setConfirmado] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [progreso, setProgreso] = useState(0),
    [error, setError] = useState('');
  return (
    <Modal
      abierto
      titulo={clase === 'FIRMA' ? 'Adjuntar firma' : 'Adjuntar evidencia'}
      onCerrar={() => {
        if (!ocupado) cerrar();
      }}
    >
      <form
        noValidate
        className="my-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!file || !confirmado || ocupado) return;
          setOcupado(true);
          setError('');
          void api
            .cargar(d.id, d.version, clase, file, setProgreso)
            .then(hecho)
            .catch((e: Error) => setError(e.message))
            .finally(() => setOcupado(false));
        }}
      >
        <div data-tour="actas-adjuntos">
          <FileField
            name="archivo"
            label={clase === 'FIRMA' ? 'Escaneo del acta firmada' : 'Archivo de evidencia'}
            hint={`PDF, JPG o PNG de hasta ${maxMb} MB; no se guarda en el borrador del navegador.`}
            required
            accept="application/pdf,image/jpeg,image/png"
            maxBytes={maxMb * 1024 * 1024}
            onValueChange={(f) => {
              setFile(f);
              setConfirmado(false);
            }}
            disabled={ocupado}
          />
          <label className="flex gap-2 my-4">
            <input
              type="checkbox"
              checked={confirmado}
              disabled={ocupado || !file}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            {clase === 'FIRMA'
              ? 'Confirmo que el escaneo corresponde al acta firmada por el empleado; cambiará a Firmada.'
              : 'Confirmo que la evidencia corresponde a esta acta.'}
          </label>
          {ocupado && (
            <p role="status">
              {progreso < 100 ? `Transferencia: ${progreso} %` : 'Validando y guardando…'}
            </p>
          )}
          <FormErrorSummary mensajes={[]} mensajeServidor={error} />
          <div className="flex gap-3">
            <Button icono="cancelar" variante="secundario" disabled={ocupado} onClick={cerrar}>
              Cancelar
            </Button>
            <Button icono="cargar" type="submit" disabled={!confirmado || !file} cargando={ocupado}>
              Guardar {clase === 'FIRMA' ? 'firma' : 'evidencia'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
