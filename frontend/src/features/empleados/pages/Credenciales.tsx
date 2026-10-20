import { HelpProvider, usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaCredenciales } from '../help/pasos';
import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { Credencial } from '../api/empleados';
interface Props {
  datos: Credencial[];
  pdf?: string;
  onCerrar: () => void;
}
export function Credenciales(props: Props) {
  return (
    <HelpProvider>
      <EntregaCredenciales {...props} />
    </HelpProvider>
  );
}
function EntregaCredenciales({ datos, pdf, onCerrar }: Props) {
  usePageHelp(ayudaCredenciales);
  const [mensaje, setMensaje] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [descargado, setDescargado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const texto = datos
    .map(
      (d) =>
        `${d.nombre ? d.nombre + '\n' : ''}Usuario: ${d.usuario}\nContraseña temporal: ${d.contrasenaTemporal}`,
    )
    .join('\n\n');
  const cerrar = () => {
    if (confirmado && (copiado || descargado)) onCerrar();
    else
      setMensaje('Copia o descarga las credenciales y confirma que las guardaste antes de cerrar.');
  };
  return (
    <Modal abierto titulo="Contraseñas temporales · entrega privada" onCerrar={cerrar}>
      <p className="alerta my-4" data-tour="credenciales-aviso">
        Estas contraseñas se muestran una sola vez. Copia las credenciales o descarga el único PDF
        antes de cerrar. El primer inicio exige cambiarlas. Si las pierdes, RRHH/ADMIN puede
        restablecerlas desde el expediente.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Usuario</th>
              <th>Contraseña temporal</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.idUsuario}>
                <td>{d.nombre ?? 'Empleado'}</td>
                <td>{d.usuario}</td>
                <td>
                  <code>{d.contrasenaTemporal}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status">{mensaje}</p>
      <div className="my-4 flex flex-wrap justify-end gap-3" data-tour="credenciales-entrega">
        <Button
          icono="copiar"
          cargando={copiando}
          onClick={() => {
            if (copiando) return;
            setCopiando(true);
            void (async () => {
              try {
                await navigator.clipboard.writeText(texto);
                setCopiado(true);
                setMensaje('Credenciales copiadas. Entrégalas de forma privada.');
              } catch {
                setMensaje('No se pudo copiar. Descarga el PDF y consérvalo en privado.');
              } finally {
                setCopiando(false);
              }
            })();
          }}
        >
          Copiar credenciales
        </Button>
        <Button
          icono="exportar"
          disabled={descargado || !pdf}
          title={
            descargado
              ? 'El PDF ya se descargó. No se conserva en el servidor.'
              : 'Un PDF membretado, una página por empleado; una sola descarga.'
          }
          onClick={() => {
            if (descargado || !pdf) return;
            try {
              const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
              const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'credenciales-temporales.pdf';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setDescargado(true);
              setMensaje('PDF descargado. Confirma que lo guardaste antes de cerrar.');
            } catch {
              setMensaje('No se pudo descargar. Copia las credenciales antes de cerrar.');
            }
          }}
        >
          Descargar PDF
        </Button>
      </div>
      <label className="my-4 flex items-center gap-3" data-tour="credenciales-confirmar">
        <input
          type="checkbox"
          checked={confirmado}
          disabled={!copiado && !descargado}
          onChange={(e) => setConfirmado(e.target.checked)}
        />
        Ya copié o descargué las credenciales
      </label>
      <Button icono="aprobar" disabled={!confirmado || (!copiado && !descargado)} onClick={cerrar}>
        Cerrar entrega
      </Button>
    </Modal>
  );
}
