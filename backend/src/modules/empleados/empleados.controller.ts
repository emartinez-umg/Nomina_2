import type { Request, Response } from 'express';
import { z } from 'zod';
import { respuestaOk } from '../../shared/utils/respuesta.js';
import { autenticacionDe } from '../../shared/security/rbac.js';
import { contextoDe } from '../auth/auth.controller.js';
import { sinDatos } from '../auth/auth.schemas.js';
import { idSchema } from '../auditoria/auditoria.schemas.js';
import {
  fecha,
  crearEmpleadoSchema,
  editarEmpleadoSchema,
  querySchema,
  selectorEmpleadosSchema,
  salarioSchema,
  bajaSchema,
  cargaSchema,
  confirmarCargaSchema,
} from './empleados.schemas.js';
import { restablecerSchema } from '../usuarios/usuarios.schemas.js';
import { plantillaCsv } from './empleados.csv.js';
import type { crearEmpleadosService } from './empleados.service.js';
const idDe = (req: Request) => z.object({ id: idSchema }).strict().parse(req.params).id;
export function crearEmpleadosController(s: ReturnType<typeof crearEmpleadosService>) {
  const responder = (res: Response, d: unknown, status = 200) =>
    res
      .set('Cache-Control', 'no-store')
      .set('Pragma', 'no-cache')
      .status(status)
      .json(respuestaOk(d));
  return {
    parentescos: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.parentescos());
    },
    restablecer: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const d = restablecerSchema.parse(req.body);
      responder(
        res,
        await s.restablecer(autenticacionDe(req), contextoDe(req).ip, idDe(req), d.motivo),
      );
    },
    reglas: async (req: Request, res: Response) => {
      const q = z.object({ fecha: fecha.optional() }).strict().parse(req.query);
      responder(res, await s.reglas(q.fecha));
    },
    opciones: async (req: Request, res: Response) => {
      const { referencia } = z
        .object({
          referencia: z.enum([
            'idDepartamento',
            'idPuesto',
            'idJefatura',
            'idTipoContrato',
            'idCentroTrabajo',
            'idHorario',
            'idBanco',
          ]),
        })
        .strict()
        .parse(req.params);
      const q = z
        .object({
          buscar: z.string().max(150).default(''),
          pagina: z.coerce.number().int().min(1).max(1000000).default(1),
          seleccionado: idSchema.optional(),
          departamento: idSchema.optional(),
        })
        .strict()
        .parse(req.query);
      responder(
        res,
        await s.opciones(referencia, q.buscar, q.pagina, q.seleccionado, q.departamento),
      );
    },
    listar: async (req: Request, res: Response) =>
      responder(res, await s.listar(querySchema.parse(req.query))),
    selector: async (req: Request, res: Response) =>
      responder(res, await s.selector(selectorEmpleadosSchema.parse(req.query))),
    exportar: async (req: Request, res: Response) =>
      responder(res, await s.exportar(querySchema.parse(req.query))),
    detalle: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.detalle(idDe(req)));
    },
    pestana: async (req: Request, res: Response) => {
      const { id, tipo } = z
        .object({
          id: idSchema,
          tipo: z.enum(['salario', 'descuentos', 'vacaciones', 'documentos', 'historial']),
        })
        .strict()
        .parse(req.params);
      const { pagina } = z
        .object({ pagina: z.coerce.number().int().min(1).max(1000000).default(1) })
        .strict()
        .parse(req.query);
      responder(res, await s.pestana(id, tipo, pagina));
    },
    crear: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(
        res,
        await s.crear(
          autenticacionDe(req),
          contextoDe(req).ip,
          crearEmpleadoSchema.parse(req.body),
        ),
        201,
      );
    },
    editar: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(
        res,
        await s.editar(
          autenticacionDe(req),
          contextoDe(req).ip,
          idDe(req),
          editarEmpleadoSchema.parse(req.body),
        ),
      );
    },
    salario: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(
        res,
        await s.salario(
          autenticacionDe(req),
          contextoDe(req).ip,
          idDe(req),
          salarioSchema.parse(req.body),
        ),
      );
    },
    baja: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(
        res,
        await s.baja(
          autenticacionDe(req),
          contextoDe(req).ip,
          idDe(req),
          bajaSchema.parse(req.body),
        ),
      );
    },
    plantilla: (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, plantillaCsv());
    },
    previsualizar: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const d = cargaSchema.parse(req.body);
      responder(
        res,
        await s.previsualizar(autenticacionDe(req), contextoDe(req).ip, d.nombreArchivo, d.csv),
        201,
      );
    },
    confirmar: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      const d = confirmarCargaSchema.parse(req.body);
      responder(
        res,
        await s.confirmar(autenticacionDe(req), contextoDe(req).ip, idDe(req), d.modalidad),
      );
    },
    reporte: async (req: Request, res: Response) => {
      sinDatos.parse(req.query);
      responder(res, await s.reporte(idDe(req), autenticacionDe(req).idUsuario));
    },
  };
}
