import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { plantilla, previsualizar, confirmar, reporte, descargar } from '../api/empleados';
import type { Preview, Credencial } from '../api/empleados';
import { Credenciales } from './Credenciales';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { FileField, SelectField } from '../../../components/forms';
import { ConfirmModal } from '../../../components/ui/Modal';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { useToast } from '../../../components/ui/Toast';
import { ayudaEmpleados } from '../help/pasos';
const ayuda = ayudaEmpleados('carga');
export function CargaMasivaPage() {
  const { usuario } = useSession();
  usePageHelp(ayuda, usuario?.rol);
  const cliente = useQueryClient(),
    nav = useNavigate(),
    toast = useToast();
  const { campo, draft } = useDraftValues('carga-empleados', undefined, {
    modalidad: 'TODO_O_NADA',
  });
  const [modalidad, setModalidad] = campo('modalidad');
  const [archivo, setArchivo] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(''),
    [confirmacion, setConfirmacion] = useState(false),
    [resultado, setResultado] = useState<{ id: number; importadas: number } | null>(null),
    [credenciales, setCredenciales] = useState<Credencial[] | null>(null);
  const invalidas = preview?.filas.filter((f) => Object.keys(f.errores).length).length ?? 0;
  const operar = async (fn: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <>
      <h1>Carga masiva de empleados</h1>
      <p className="my-3 text-secundario">Valida cada fila antes de dar de alta al personal.</p>

      <div className="my-4">
        <Button
          icono="anterior"
          variante="secundario"
          disabled={ocupado}
          onClick={() => nav('/empleados')}
        >
          Volver a empleados
        </Button>
      </div>
      <FormDraftNotice draft={draft} />
      <Card>
        <section data-tour="carga-archivo">
          <h2>1. Preparar archivo</h2>
          <p className="my-3">
            CSV UTF-8, máximo 100 empleados y 1 MB. Conserva la cabecera; reemplaza la fila
            ilustrativa. Fechas aaaa-mm-dd, IDs reales de Catálogos, salario sin Q ni separadores y
            generarUsuario true/false.
          </p>
          <Button
            icono="exportar"
            variante="secundario"
            disabled={ocupado}
            onClick={() =>
              void operar(async () => descargar(await plantilla(), 'plantilla-empleados.csv'))
            }
          >
            Descargar plantilla de ejemplo
          </Button>
          <div className="my-4">
            <FileField
              name="csv"
              label="Archivo de empleados"
              hint="Archivo .csv de hasta 1 MB. No cambies los nombres ni el orden de las columnas."
              accept=".csv"
              maxBytes={1000000}
              disabled={ocupado}
              required
              onValueChange={(f) => {
                setArchivo(f);
                setPreview(null);
                setResultado(null);
              }}
            />
          </div>
          <Button
            icono="ver"
            cargando={ocupado}
            disabled={!archivo}
            onClick={() =>
              void operar(async () => {
                if (archivo) {
                  const p = await previsualizar(archivo.name, await archivo.text());
                  setPreview(p);
                  setResultado(null);
                }
              })
            }
          >
            Validar y ver vista previa
          </Button>
        </section>
        {error && (
          <p role="alert" className="campo-error my-4">
            {error}
          </p>
        )}
        {preview && (
          <section data-tour="carga-preview" className="my-6">
            <h2>2. Revisar filas</h2>
            <p className="my-3">
              {preview.filas.length} filas · {preview.filas.length - invalidas} válidas ·{' '}
              {invalidas} con errores.{' '}
              {resultado
                ? 'Validación previa a la importación; consulta el resultado en el reporte.'
                : 'Aún no se han creado empleados.'}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fila CSV</th>
                    <th>Empleado</th>
                    <th>Estado</th>
                    <th>Errores y advertencias</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.filas.map((f) => (
                    <tr key={f.numero}>
                      <td>{f.numero}</td>
                      <td>{f.nombre}</td>
                      <td>{Object.keys(f.errores).length ? 'Con errores' : 'Válida'}</td>
                      <td>
                        {Object.entries(f.errores).map(([k, v]) => (
                          <p className="campo-error" key={k}>
                            {k}: {v.join(' ')}
                          </p>
                        ))}
                        {f.advertencias.map((a) => (
                          <p key={a} className="text-sm">
                            {a}
                          </p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {preview && !resultado && (
          <section data-tour="carga-confirmar">
            <h2>3. Confirmar importación</h2>
            <div className="my-4">
              <SelectField
                name="modalidad"
                label="Modalidad de importación"
                hint="Todo o nada exige todas las filas válidas. Solo válidas omite las filas con errores."
                value={modalidad}
                onValueChange={setModalidad}
                opciones={[
                  { value: 'TODO_O_NADA', label: 'Todo o nada' },
                  { value: 'SOLO_VALIDAS', label: 'Solo filas válidas' },
                ]}
                disabled={ocupado}
              />
            </div>
            <Button
              icono="aprobar"
              disabled={
                ocupado ||
                (modalidad === 'TODO_O_NADA' && invalidas > 0) ||
                invalidas === preview.filas.length
              }
              title={
                invalidas === preview.filas.length
                  ? 'Corrige el archivo: no hay filas válidas.'
                  : modalidad === 'TODO_O_NADA' && invalidas > 0
                    ? 'Corrige los errores o elige Solo filas válidas.'
                    : 'Revisar confirmación de importación'
              }
              onClick={() => setConfirmacion(true)}
            >
              Importar empleados
            </Button>
          </section>
        )}
        {resultado && (
          <section data-tour="carga-reporte" className="my-5">
            <h2>Importación completada</h2>
            <p className="my-3">
              {resultado.importadas === 1
                ? 'Se creó 1 empleado.'
                : `Se crearon ${resultado.importadas} empleados.`}{' '}
              El reporte conserva estados e IDs, sin contraseñas.
            </p>
            <Button
              icono="exportar"
              cargando={ocupado}
              onClick={() =>
                void operar(async () =>
                  descargar(await reporte(resultado.id), `carga-${resultado.id}-resultados.csv`),
                )
              }
            >
              Descargar reporte de resultados
            </Button>
          </section>
        )}
      </Card>
      <ConfirmModal
        abierto={confirmacion}
        titulo="Confirmar alta masiva"
        descripcion={`Se importarán ${modalidad === 'TODO_O_NADA' ? preview?.filas.length : (preview?.filas.length ?? 0) - invalidas} empleados. Se volverán a validar los datos; todos los empleados seleccionados y sus usuarios se guardarán en una transacción.`}
        cargando={ocupado}
        onCancelar={() => setConfirmacion(false)}
        onConfirmar={() =>
          void operar(async () => {
            if (!preview) return;
            try {
              const saved = await confirmar(preview.id, modalidad);
              draft.limpiar();
              setResultado({ id: saved.id, importadas: saved.importadas });
              setConfirmacion(false);
              if (saved.credenciales.length) setCredenciales(saved.credenciales);
              await cliente.invalidateQueries({ queryKey: ['empleados'] });
              toast('Carga importada y auditada.');
            } catch (e) {
              setConfirmacion(false);
              throw e;
            }
          })
        }
      />
      {credenciales && <Credenciales datos={credenciales} onCerrar={() => setCredenciales(null)} />}
    </>
  );
}
