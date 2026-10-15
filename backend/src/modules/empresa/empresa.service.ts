import { createHash } from 'node:crypto';
import type { Connection } from 'oracledb';
import type { BaseDatos } from '../../shared/db/pool.js';
import { enTransaccion } from '../../shared/db/transaccion.js';
import { ErrorConflicto, ErrorProhibido } from '../../shared/errors/errors.js';
import { exigirMembrete, validarFirmante } from '../../shared/pdf/documento.js';
import { revalidarActor } from '../auth/auth.service.js';
import type { Autenticacion } from '../auth/auth.types.js';
import { registrarAuditoria } from '../auditoria/auditoria.service.js';
import { bloquearCatalogos } from '../catalogos/catalogos.repository.js';
import { empresaSchema } from './empresa.schemas.js';
import { normalizarLogo } from './empresa.logo.js';
import * as repo from './empresa.repository.js';
export async function membrete(c: Connection) {
  return exigirMembrete(await repo.obtenerEmpresa(c));
}
export async function firmante(c: Connection, idUsuario: number) {
  return {
    ...validarFirmante(await repo.perfilFirmante(c, idUsuario)),
    idUsuario,
    fecha: await repo.fechaFirma(c),
  };
}
const publico = (e: repo.Empresa | null) =>
  e
    ? {
        ...e,
        logo: e.logo ? { mime: 'image/png' as const, base64: e.logo.toString('base64') } : null,
      }
    : null;
const auditable = (e: repo.Empresa | null) => (e ? { ...e, logo: undefined } : null);
export function crearEmpresaService(db: BaseDatos) {
  return {
    consultar: () => db.conConexion(async (c) => publico(await repo.obtenerEmpresa(c))),
    estado: (auth: Autenticacion) =>
      db.conConexion(async (c) => {
        const e = await repo.obtenerEmpresa(c);
        let mensaje: string | null = null;
        try {
          exigirMembrete(e);
        } catch (error) {
          mensaje = (error as Error).message;
        }
        let perfil = auth.rol === 'EMPLEADO' ? null : await repo.perfilFirmante(c, auth.idUsuario);
        if (perfil) {
          try {
            validarFirmante(perfil);
          } catch {
            perfil = null;
          }
        }
        return { configurada: !mensaje, mensaje, firmante: perfil };
      }),
    guardar: (auth: Autenticacion, ip: string, raw: unknown) =>
      enTransaccion(db, async (c) => {
        const d = empresaSchema.parse(raw);
        await bloquearCatalogos(c, true);
        const a = { ...(await revalidarActor(c, auth)), ip };
        if (!['ADMIN', 'RH'].includes(a.rol)) throw new ErrorProhibido();
        const antes = await repo.obtenerEmpresa(c);
        if ((antes?.version ?? 0) !== d.version)
          throw new ErrorConflicto(
            'La empresa cambió mientras editabas. Recarga antes de guardar.',
          );
        const logo =
          d.logo === undefined
            ? (antes?.logo ?? null)
            : d.logo === null
              ? null
              : await normalizarLogo(d.logo.mime, d.logo.base64);
        const hash = logo ? createHash('sha256').update(logo).digest('hex') : null;
        const despues = await repo.guardarEmpresa(c, d, antes, logo, hash, a.idUsuario);
        await registrarAuditoria(c, {
          actor: a,
          accion: 'CONFIGURAR_EMPRESA',
          entidad: 'CONFIGURACION_EMPRESA',
          idEntidad: despues.id,
          antes: auditable(antes),
          despues: auditable(despues),
        });
        return publico(despues);
      }),
  };
}
