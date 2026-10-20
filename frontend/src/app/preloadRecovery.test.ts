import { describe, expect, it, vi } from 'vitest';
import { instalarRecuperacionModulos } from './preloadRecovery';

describe('recuperación de módulos de producción', () => {
  it('recarga una sola vez por versión, incluso después de volver a montar la aplicación', () => {
    sessionStorage.clear();
    const recargar = vi.fn();
    const enviar = () => {
      const evento = new Event('vite:preloadError', { cancelable: true });
      window.dispatchEvent(evento);
      return evento.defaultPrevented;
    };
    let retirar = instalarRecuperacionModulos('build-a', sessionStorage, recargar);
    expect(enviar()).toBe(true);
    retirar();
    retirar = instalarRecuperacionModulos('build-a', sessionStorage, recargar);
    expect(enviar()).toBe(false);
    expect(recargar).toHaveBeenCalledTimes(1);
    retirar();
    retirar = instalarRecuperacionModulos('build-b', sessionStorage, recargar);
    expect(enviar()).toBe(true);
    expect(recargar).toHaveBeenCalledTimes(2);
    retirar();
  });
  it('sin almacenamiento deja que el error llegue a la ruta y evita un ciclo de recargas', () => {
    const recargar = vi.fn();
    const retirar = instalarRecuperacionModulos(
      'build',
      {
        getItem: () => {
          throw new Error('Bloqueado');
        },
        setItem: vi.fn(),
      },
      recargar,
    );
    const evento = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(evento);
    expect(recargar).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
    retirar();
  });
});
