import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activarBorradoresUsuario,
  claveBorrador,
  leerBorrador,
  limpiarBorradoresSesion,
  sanearBorrador,
} from './formDraft';
beforeEach(() => localStorage.clear());
describe('Almacenamiento de borradores', () => {
  it('excluye credenciales, tokens, adjuntos y objetos no serializables también dentro de arreglos', () => {
    const datos = {
      nombre: 'Ana',
      contrasenaActual: 'privada',
      contraseñaNueva: 'privada',
      password: 'privada',
      apiToken: 'privado',
      csrf: 'privado',
      archivo: 'base64',
      adjunto: { contenido: 'base64' },
      credenciales: ['privadas'],
      documentos: new File(['privado'], 'x.txt'),
      objetos: new Blob(['privado']),
      fecha: new Date(),
      funcion: () => {},
      infinito: Infinity,
      contactos: [
        {
          correo: 'a@example.test',
          access_token: 'privado',
          datos: { secret: 'privado', telefono: '55551234' },
        },
      ],
    };
    expect(sanearBorrador(datos)).toEqual({
      nombre: 'Ana',
      contactos: [{ correo: 'a@example.test', datos: { telefono: '55551234' } }],
    });
    expect(JSON.stringify(sanearBorrador(datos))).not.toMatch(/privad|base64/);
  });
  it.each(['no-json', 'null', '[]', '{"version":1}', '{"version":1,"guardado":0,"valores":[]}'])(
    'ignora y elimina datos dañados: %s',
    (valor) => {
      const clave = claveBorrador(7, 'x');
      localStorage.setItem(clave, valor);
      expect(leerBorrador(clave, 1)).toBeNull();
      expect(localStorage.getItem(clave)).toBeNull();
    },
  );
  it('sanea otra vez al restaurar e ignora claves de prototipo', () => {
    const clave = claveBorrador(7, 'x');
    localStorage.setItem(
      clave,
      '{"version":1,"guardado":0,"valores":{"__proto__":{"a":1},"nombre":"Ana","token":"privado"}}',
    );
    expect(leerBorrador(clave, 1)?.valores).toEqual({ nombre: 'Ana' });
  });
  it('purga únicamente borradores ajenos al entrar y todos al salir, conservando otras preferencias', () => {
    localStorage.setItem(claveBorrador(7, 'x'), 'propio');
    localStorage.setItem(claveBorrador(70, 'x'), 'ajeno');
    localStorage.setItem('nomina2:ayuda:x', 'vista');
    activarBorradoresUsuario(7);
    expect(localStorage.getItem(claveBorrador(7, 'x'))).toBe('propio');
    expect(localStorage.getItem(claveBorrador(70, 'x'))).toBeNull();
    limpiarBorradoresSesion();
    expect(localStorage.getItem(claveBorrador(7, 'x'))).toBeNull();
    expect(localStorage.getItem('nomina2:ayuda:x')).toBe('vista');
  });
  it('purga incluso si falla escribir el marcador por falta de espacio', () => {
    localStorage.setItem(claveBorrador(8, 'x'), 'ajeno');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Lleno');
    });
    expect(() => activarBorradoresUsuario(7)).not.toThrow();
    expect(localStorage.getItem(claveBorrador(8, 'x'))).toBeNull();
  });
});
