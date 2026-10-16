import { HelpProvider, usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaRestablecer } from '../help/pasos';
import { useState } from 'react';
import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { TextAreaField } from '../../../components/forms';
import { Credenciales } from './Credenciales';
import { restablecer } from '../api/empleados';
import type { Empleado } from '../api/empleados';
function FormularioRestablecer({ empleado, cerrar }: { empleado: Empleado; cerrar: () => void }) {
  usePageHelp(ayudaRestablecer);
  const { campo, draft } = useDraftValues(
    'empleado-restablecer',
    empleado.id,
    { motivo: '' },
    true,
    {
      alDescartar: () => {
        setRevision(false);
        setError('');
      },
    },
  );
  const [motivo, setMotivo] = campo('motivo');
  const [revision, setRevision] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [entrega, setEntrega] = useState<Awaited<ReturnType<typeof restablecer>> | null>(null);
  if (entrega)
    return (
      <Credenciales
        datos={[entrega.credenciales]}
        pdf={entrega.pdfCredenciales}
        onCerrar={() => {
          setEntrega(null);
          cerrar();
        }}
      />
    );
  return (
    <Modal
      abierto
      titulo="Restablecer contraseña del empleado"
      onCerrar={() => {
        if (!ocupado) cerrar();
      }}
    >
      <FormDraftNotice draft={draft} />
      <p className="alerta my-4">
        Se revocarán las sesiones de {empleado.usuario} y la contraseña anterior dejará de
        funcionar. Entrega la nueva contraseña en privado; deberá cambiarla al ingresar.
      </p>
      <div data-tour="restablecer-motivo">
        <TextAreaField
          name="motivo"
          label="Motivo del restablecimiento"
          required
          maxLength={500}
          hint="Explica por qué se necesita una nueva contraseña (5–500 caracteres). Se registra en la bitácora."
          value={motivo}
          onValueChange={(v) => {
            setMotivo(v);
            setRevision(false);
          }}
          disabled={ocupado}
        />
      </div>
      {error && (
        <p role="alert" className="campo-error">
          {error}
        </p>
      )}
      <div data-tour="restablecer-confirmar" className="my-4 flex justify-end gap-3">
        <Button icono="cancelar" variante="secundario" disabled={ocupado} onClick={cerrar}>
          Cancelar
        </Button>
        {!revision ? (
          <Button icono="ver" disabled={motivo.trim().length < 5} onClick={() => setRevision(true)}>
            Revisar restablecimiento
          </Button>
        ) : (
          <Button
            icono="aprobar"
            cargando={ocupado}
            onClick={() => {
              if (ocupado) return;
              setOcupado(true);
              setError('');
              void restablecer(empleado.id, motivo)
                .then((r) => {
                  draft.limpiar();
                  setEntrega(r);
                })
                .catch((e) => setError((e as Error).message))
                .finally(() => setOcupado(false));
            }}
          >
            Confirmar restablecimiento
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function RestablecerEmpleadoModal(props: { empleado: Empleado; cerrar: () => void }) {
  return (
    <HelpProvider>
      <FormularioRestablecer {...props} />
    </HelpProvider>
  );
}
