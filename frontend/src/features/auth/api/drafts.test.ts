import { beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarSesion, cerrarSesion } from './auth';
import { solicitar } from '../../../lib/http';
import { claveBorrador } from '../../../lib/formDraft';
vi.mock('../../../lib/http', () => ({ solicitar: vi.fn(), guardarCsrf: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
describe('Borradores en los límites de autenticación', () => {
  it('login exitoso purga borradores ajenos y conserva los de la misma cuenta', async () => {
    localStorage.setItem(claveBorrador(7, 'empleado'), 'propio');
    localStorage.setItem(claveBorrador(8, 'empleado'), 'ajeno');
    vi.mocked(solicitar).mockResolvedValue({
      usuario: { idUsuario: 7 },
      csrfToken: 'token-prueba',
    });
    await iniciarSesion({ usuario: 'ana.perez', contrasena: 'Clave!Prueba123' });
    expect(localStorage.getItem(claveBorrador(7, 'empleado'))).toBe('propio');
    expect(localStorage.getItem(claveBorrador(8, 'empleado'))).toBeNull();
    expect(Object.values(localStorage).join('')).not.toMatch(/token-prueba|Clave!Prueba123/);
  });
  it('login fallido no purga los borradores existentes', async () => {
    localStorage.setItem(claveBorrador(7, 'empleado'), 'propio');
    vi.mocked(solicitar).mockRejectedValue(new Error('Credenciales incorrectas'));
    await expect(
      iniciarSesion({ usuario: 'otra.cuenta', contrasena: 'errónea' }),
    ).rejects.toThrow();
    expect(localStorage.getItem(claveBorrador(7, 'empleado'))).toBe('propio');
  });
  it('logout explícito exitoso limpia todos los borradores', async () => {
    localStorage.setItem(claveBorrador(7, 'empleado'), 'propio');
    vi.mocked(solicitar).mockResolvedValue({ mensaje: 'Sesión cerrada' });
    await cerrarSesion();
    expect(localStorage.getItem(claveBorrador(7, 'empleado'))).toBeNull();
  });
  it('un logout fallido conserva el borrador para reintentar sin pérdida', async () => {
    localStorage.setItem(claveBorrador(7, 'empleado'), 'propio');
    vi.mocked(solicitar).mockRejectedValue(new Error('Sin conexión'));
    await expect(cerrarSesion()).rejects.toThrow();
    expect(localStorage.getItem(claveBorrador(7, 'empleado'))).toBe('propio');
  });
});
