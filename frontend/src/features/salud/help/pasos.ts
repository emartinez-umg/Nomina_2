import { driver } from 'driver.js';
import type { DriveStep } from 'driver.js';

const pasos: DriveStep[] = [
  {
    element: '[data-tour="estado"]',
    popover: {
      title: 'Estado del sistema',
      description:
        'Esta página temporal comprueba la API y Oracle. El estado conectado solo aparece cuando una consulta real a la base de datos termina correctamente. Si hay un fallo, verás un mensaje para volver a intentar.',
    },
  },
  {
    element: '[data-tour="actualizar"]',
    popover: {
      title: 'Volver a comprobar',
      description:
        'Usa este botón después de restablecer la conexión. Mientras se consulta, el botón se deshabilita para evitar solicitudes repetidas. La comprobación también se repite automáticamente cada 30 segundos.',
    },
  },
];

export function iniciarAyudaSalud() {
  driver({
    steps: pasos,
    showProgress: true,
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: 'Entendido',
    progressText: '{{current}} de {{total}}',
  }).drive();
}
