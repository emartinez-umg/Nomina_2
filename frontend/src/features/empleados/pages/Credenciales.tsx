import { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import type { Credencial } from '../api/empleados';
export function Credenciales({ datos, onCerrar }: { datos: Credencial[]; onCerrar: () => void }) {
  const [mensaje, setMensaje] = useState('');
  const texto = datos
    .map((d) => `Usuario: ${d.usuario}\nContraseña temporal: ${d.contrasenaTemporal}`)
    .join('\n\n');
  const imprimir = () => {
    const marco = document.createElement('iframe');
    marco.style.position = 'fixed';
    marco.style.width = '0';
    marco.style.height = '0';
    marco.title = 'Impresión privada de credenciales';
    document.body.appendChild(marco);
    const doc = marco.contentDocument;
    if (doc) {
      doc.title = 'Entrega privada de acceso';
      const h = doc.createElement('h1');
      h.textContent = 'Acceso a Nómina';
      const p = doc.createElement('pre');
      p.textContent = texto + '\n\nCambia la contraseña en tu primer inicio de sesión.';
      doc.body.append(h, p);
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
    }
    setTimeout(() => marco.remove(), 1000);
  };
  return (
    <Modal abierto titulo="Contraseñas temporales · entrega privada" onCerrar={onCerrar}>
      <p className="alerta my-4">
        Estas contraseñas se muestran una sola vez. Copia o imprime antes de cerrar. El primer
        inicio exige cambiarlas.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Contraseña temporal</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.idUsuario}>
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
      <div className="my-4 flex flex-wrap justify-end gap-3">
        <Button
          icono="copiar"
          onClick={() =>
            void navigator.clipboard
              .writeText(texto)
              .then(() => setMensaje('Credenciales copiadas. Entrégalas de forma privada.'))
              .catch(() => setMensaje('No se pudo copiar. Selecciona el texto o utiliza Imprimir.'))
          }
        >
          Copiar
        </Button>
        <Button icono="imprimir" onClick={imprimir}>
          Imprimir
        </Button>
        <Button icono="aprobar" onClick={onCerrar}>
          Ya las guardé · cerrar
        </Button>
      </div>
    </Modal>
  );
}
