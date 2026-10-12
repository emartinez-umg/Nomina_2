import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearLogger } from '../../config/logger.js';
import type { Autenticacion, Rol } from '../../modules/auth/auth.types.js';
import { depurarAuditoria } from '../../modules/auditoria/auditoria.service.js';
import { manejarErrores } from '../middleware/error-handler.js';
import {
  baseNombreUsuario,
  coincideToken,
  generarContrasenaTemporal,
  generarToken,
  hashToken,
  politicaContrasena,
} from './credenciales.js';
import { crearCsrfPrelogin, COOKIE_PRELOGIN } from './csrf.js';
import { exigirCambioCompletado, permitirRoles, verificarPropiedad } from './rbac.js';

const identidad: Autenticacion = {
  idUsuario: 10,
  usuario: 'ana.lopez',
  correo: 'ana@example.test',
  idRol: 3,
  rol: 'EMPLEADO',
  activo: true,
  cambioObligatorio: false,
  idSesion: 1,
  csrfHash: hashToken(generarToken()),
};
function appRol(rol: Rol, temporal = false) {
  const app = express();
  app.use((req, _res, next) => {
    req.autenticacion = { ...identidad, rol, cambioObligatorio: temporal };
    next();
  });
  app.get('/admin', exigirCambioCompletado, permitirRoles('ADMIN'), (_req, res) =>
    res.json({ ok: true }),
  );
  app.use(manejarErrores(crearLogger('silent')));
  return app;
}
describe('credenciales y tokens', () => {
  it.each(['cortaA1!', 'sinmayuscula1!', 'SINMINUSCULA1!', 'SinNumeros!!!', 'SinSimbolo123'])(
    'rechaza contraseña débil %s',
    (valor) => {
      expect(politicaContrasena.safeParse(valor).success).toBe(false);
    },
  );
  it('genera contraseñas temporales aleatorias que cumplen la política', () => {
    const claves = Array.from({ length: 100 }, generarContrasenaTemporal);
    expect(new Set(claves).size).toBe(100);
    for (const clave of claves) expect(politicaContrasena.parse(clave)).toHaveLength(24);
  });
  it('normaliza nombres con acentos y espacios', () => {
    expect(baseNombreUsuario('José María', 'López Pérez')).toBe('josemaria.lopezperez');
    expect(() => baseNombreUsuario('123', '!!!')).toThrow();
  });
  it('compara hashes sin aceptar tokens truncados o tipos inválidos', () => {
    const token = generarToken();
    const hash = hashToken(token);
    expect(coincideToken(token, hash)).toBe(true);
    expect(coincideToken(generarToken(), hash)).toBe(false);
    for (const valor of ['', '0', null, [], {}]) expect(coincideToken(valor, hash)).toBe(false);
  });
  it('depura secretos y datos sensibles recursivamente antes de auditar', () => {
    expect(
      depurarAuditoria({
        usuario: 'ana.lopez',
        CONTRASENA_HASH: 'secreto',
        tokens: ['secreto'],
        perfil: { dpi: '123', nit: '456', cuentaBancaria: '789', activo: true },
        lista: [{ password: 'secreto', rol: 'RH' }],
      }),
    ).toEqual({ usuario: 'ana.lopez', perfil: { activo: true }, lista: [{ rol: 'RH' }] });
  });
});
describe('RBAC y propiedad de recursos', () => {
  it.each(['RH', 'EMPLEADO'] as const)('deniega administración a %s', async (rol) => {
    await request(appRol(rol)).get('/admin').expect(403);
  });
  it('permite ADMIN', async () => {
    await request(appRol('ADMIN')).get('/admin').expect(200);
  });
  it('bloquea incluso ADMIN hasta cambiar contraseña', async () => {
    const r = await request(appRol('ADMIN', true)).get('/admin').expect(403);
    expect(r.body.error.codigo).toBe('CAMBIO_CONTRASENA_OBLIGATORIO');
  });
  it('empleado solo puede acceder a su propietario obtenido del servidor', () => {
    expect(() => verificarPropiedad(identidad, 10)).not.toThrow();
    expect(() => verificarPropiedad(identidad, 11)).toThrow('propios datos');
    expect(() => verificarPropiedad(identidad, null)).toThrow('propios datos');
    for (const rol of ['ADMIN', 'RH'] as const)
      expect(() => verificarPropiedad({ ...identidad, rol }, 11)).not.toThrow();
  });
  it('deniega sin autenticación aunque se olvide un guard previo', async () => {
    const app = express();
    app.get('/', permitirRoles('ADMIN'));
    app.use(manejarErrores(crearLogger('silent')));
    await request(app).get('/').expect(401);
  });
});
describe('CSRF previo al login', () => {
  it('exige cookie y cabecera idénticas, firmadas y no vencidas', async () => {
    const csrf = crearCsrfPrelogin();
    const app = express();
    app.use((req, _res, next) => {
      req.cookies = { [COOKIE_PRELOGIN]: req.get('Cookie-Token') };
      next();
    });
    app.post('/', csrf.verificar, (_req, res) => res.sendStatus(204));
    app.use(manejarErrores(crearLogger('silent')));
    const token = csrf.emitir();
    await request(app).post('/').set('Cookie-Token', token).set('X-CSRF-Token', token).expect(204);
    await request(app).post('/').set('Cookie-Token', token).expect(403);
    const adulterado = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    await request(app)
      .post('/')
      .set('Cookie-Token', adulterado)
      .set('X-CSRF-Token', adulterado)
      .expect(403);
    const otraInstancia = crearCsrfPrelogin().emitir();
    await request(app)
      .post('/')
      .set('Cookie-Token', otraInstancia)
      .set('X-CSRF-Token', otraInstancia)
      .expect(403);
  });
});
