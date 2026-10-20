import { Decimal } from 'decimal.js';
import type { Connection } from 'oracledb';
import { datosEmpleado, exigir, validarDataset } from './datos.js';
import type { Dataset, EmpleadoDemo, Identificadores } from './datos.js';
import * as repo from './repository.js';
import type { Tabla, Propiedad } from './repository.js';
import { catalogos } from '../../../modules/catalogos/catalogos.definiciones.js';
import { entradaSchema } from '../../../modules/catalogos/catalogos.schemas.js';
import * as catalogosRepo from '../../../modules/catalogos/catalogos.repository.js';
import * as empleadosRepo from '../../../modules/empleados/empleados.repository.js';
import { municipio } from '../../../modules/ubicaciones/ubicaciones.repository.js';
import { limpiarPalabra } from '../../../modules/codigos/codigos.generador.js';
import { generarNombreUsuario } from '../../../modules/usuarios/usuarios.service.js';
import { insertarUsuario, buscarIdRol } from '../../../modules/usuarios/usuarios.repository.js';
import { politicaContrasena, hashearContrasena } from '../../security/credenciales.js';
import { registrarAuditoria } from '../../../modules/auditoria/auditoria.service.js';
import type { ActorAuditoria } from '../../../modules/auth/auth.types.js';
import type { DatosEmpleado } from '../../../modules/empleados/empleados.schemas.js';
import { cargarExtras } from './extras.js';

export interface OpcionesDemo {
  dryRun: boolean;
  resetDemo: boolean;
  withExtras: boolean;
  applySchema: boolean;
}
export function opcionesDemo(argumentos: string[]): OpcionesDemo {
  const admitidas = new Set(['--dry-run', '--reset-demo', '--with-extras', '--apply-schema']);
  for (const a of argumentos)
    exigir(admitidas.has(a), `Opción desconocida: ${a}. Opciones: ${[...admitidas].join(', ')}.`);
  const o = {
    dryRun: argumentos.includes('--dry-run'),
    resetDemo: argumentos.includes('--reset-demo'),
    withExtras: argumentos.includes('--with-extras'),
    applySchema: argumentos.includes('--apply-schema'),
  };
  exigir(
    !o.applySchema || (!o.dryRun && !o.resetDemo),
    '--apply-schema no se combina con --dry-run ni --reset-demo: el DDL no se puede revertir.',
  );
  return o;
}
export interface Conteo {
  insertados: number;
  reutilizados: number;
  previstos: number;
  eliminados: number;
}
export class CargaDemo {
  readonly resumen: Partial<Record<Tabla, Conteo>> = {};
  readonly nuevas = new Map<string, Omit<Propiedad, 'huella'>>();
  readonly actualizadas = new Set<string>();
  readonly empleados = new Map<string, number>();
  readonly ids = new Map<string, number>();
  readonly avisos = new Set<string>();
  private virtual = 1000000000;
  constructor(
    readonly c: Connection,
    readonly dataset: Dataset,
    readonly opciones: OpcionesDemo,
    readonly actor: ActorAuditoria,
    readonly propias: Map<string, Propiedad>,
  ) {}
  contar(tabla: Tabla, tipo: keyof Conteo) {
    const r = (this.resumen[tabla] ??= {
      insertados: 0,
      reutilizados: 0,
      previstos: 0,
      eliminados: 0,
    });
    r[tipo]++;
  }
  recordar(tabla: Tabla, id: number, clave: string) {
    this.nuevas.set(repo.llave(tabla, id), { tabla, id, clave });
    this.contar(tabla, this.opciones.dryRun ? 'previstos' : 'insertados');
  }
  async crear(tabla: Tabla, clave: string, fn: () => Promise<number>) {
    const previa = [...this.propias.values()].find((p) => p.tabla === tabla && p.clave === clave);
    if (previa) {
      exigir(
        await repo.huella(this.c, tabla, previa.id),
        `${tabla}: falta una fila demo registrada; no se reconstruirá sobre historia parcial.`,
      );
      this.contar(tabla, 'reutilizados');
      return previa.id;
    }
    const id = this.opciones.dryRun ? this.virtual++ : await fn();
    this.recordar(tabla, id, clave);
    return id;
  }
  async rastrear(tabla: Tabla, id: number, clave: string) {
    const filas = await repo.dependientes(this.c, tabla, id);
    for (const f of filas)
      if (!this.propias.has(repo.llave(tabla, f.ID)) && !this.nuevas.has(repo.llave(tabla, f.ID)))
        this.recordar(tabla, f.ID, `${clave}:${f.ID}`);
  }
  async catalogo(slug: string, clave: string, entrada: Record<string, unknown>) {
    const cat = catalogos.find((r) => r.slug === slug)!;
    const tabla = cat.tabla as Tabla;
    const existentes = await repo.buscarCatalogo(this.c, cat, String(entrada.nombre));
    let id: number;
    const campos = { ...entrada };
    delete campos.localidad;
    const datos = entradaSchema(cat).parse(campos);
    if (existentes.length) {
      const e = existentes[0]!;
      exigir(
        e.ACTIVO === 1,
        `${cat.titulo}: el nombre existe inactivo; reactívalo desde el sistema antes de cargar.`,
      );
      if (slug === 'puestos')
        exigir(
          e.DEPARTAMENTO === datos.idDepartamento,
          `El puesto ${clave} existe en otro departamento.`,
        );
      id = e.ID;
      this.contar(tabla, 'reutilizados');
    } else {
      id = await this.crear(tabla, clave, () =>
        catalogosRepo.guardar(
          this.c,
          cat,
          {
            ...datos,
            ...(slug === 'centros-trabajo' ? { localidad: entrada.localidad } : {}),
            ...(slug === 'horarios' ? { jornada: entrada.jornada } : {}),
          } as Parameters<typeof catalogosRepo.guardar>[2],
          this.actor.idUsuario,
        ),
      );
      if (slug === 'horarios' && !this.opciones.dryRun && this.nuevas.has(repo.llave(tabla, id))) {
        await this.rastrear('HORARIO_BLOQUES', id, clave);
        await this.rastrear('HORARIO_BLOQUE_DIAS', id, clave);
      }
    }
    if (slug === 'horarios' && existentes.length) {
      const h = await catalogosRepo.detalle(this.c, cat, id);
      exigir(
        JSON.stringify(h?.bloques) === JSON.stringify(datos.bloques),
        `El horario ${clave} ya existe con otros bloques; no se modificará.`,
      );
    }
    if (slug === 'centros-trabajo' && existentes.length) {
      const h = await catalogosRepo.detalle(this.c, cat, id);
      exigir(
        h?.idDepartamentoGt === datos.idDepartamentoGt && h?.idMunicipioGt === datos.idMunicipioGt,
        `El centro ${clave} ya existe con otra ubicación.`,
      );
    }
    this.ids.set(`${slug}:${clave}`, id);
    return id;
  }
  obtener(slug: string, clave: string) {
    const id = this.ids.get(`${slug}:${clave}`);
    exigir(id, `No se resolvió ${slug}/${clave}.`);
    return id;
  }
  async ubicacion(departamento: string, mun: string) {
    const f = await repo.buscarUbicacion(this.c, departamento, mun);
    exigir(f, 'La ubicación demo no existe o está inactiva en el catálogo oficial.');
    return f;
  }
  async minimo() {
    const d = this.dataset.configuracion.salarioMinimoDemo;
    const existentes = await repo.minimos(this.c, d.claveInterna);
    if (!existentes.length) {
      exigir(
        !(await catalogosRepo.ultimoCierre(this.c)),
        'Falta mínimo salarial y hay periodos cerrados: configura una vigencia desde la aplicación antes de cargar.',
      );
      await this.crear('PARAMETROS_LEGALES', 'minimo-salarial', () =>
        repo.insertar(
          this.c,
          'PARAMETROS_LEGALES',
          {
            NOMBRE: d.nombre,
            CODIGO: d.claveInterna,
            CLAVE_INTERNA: d.claveInterna,
            VALOR: d.valor,
            UNIDAD: d.unidad,
            VIGENTE_DESDE: d.vigenteDesde,
            VIGENTE_HASTA: d.vigenteHasta,
            FUNDAMENTO: d.fundamento,
            MOTIVO: d.motivo,
            CREADO_POR: this.actor.idUsuario,
          },
          ['VIGENTE_DESDE', 'VIGENTE_HASTA'],
        ),
      );
    } else this.contar('PARAMETROS_LEGALES', 'reutilizados');
    for (const e of this.dataset.empleados) {
      const vigentes = existentes.filter(
        (v) => v.ACTIVO === 1 && v.DESDE <= this.hoy && (!v.HASTA || v.HASTA >= this.hoy),
      );
      exigir(
        !existentes.length || vigentes.length === 1,
        'Configura una única vigencia aplicable de SALARIO_MINIMO_MENSUAL.',
      );
      const minimo = vigentes[0]?.VALOR ?? d.valor;
      exigir(
        !vigentes[0] || vigentes[0].UNIDAD === 'QUETZALES',
        'El mínimo mensual requiere unidad QUETZALES.',
      );
      exigir(
        new Decimal(e.salarioBase).gte(minimo),
        `El salario de ${e.clave} es inferior al mínimo del destino; no se cambiarán parámetros ni salarios.`,
      );
    }
  }
  hoy = '';
  async validarEmpleado(e: EmpleadoDemo, d: DatosEmpleado) {
    const errores = await empleadosRepo.duplicados(this.c, d);
    exigir(
      !Object.keys(errores).length,
      `Identificación o correo ya registrado para ${e.clave}; no se sustituirá ningún expediente.`,
    );
    for (const key of Object.keys(
      empleadosRepo.referencias,
    ) as (keyof typeof empleadosRepo.referencias)[]) {
      const id = d[key];
      if (id === null || (this.opciones.dryRun && id >= 1000000000)) continue;
      const r = await empleadosRepo.referencia(this.c, key, id);
      exigir(r?.activo, `Referencia inactiva en ${e.clave}: ${key}.`);
      if (r.departamento)
        exigir(r.departamento === d.idDepartamento, `Puesto fuera del departamento en ${e.clave}.`);
      if (key === 'idTipoContrato')
        exigir(
          Boolean(r.requiereFechaFin) === Boolean(d.fechaFinContrato),
          `El contrato de ${e.clave} no coincide con la regla del destino.`,
        );
    }
    exigir(
      (await empleadosRepo.parentescos(this.c)).some((p) => p.value === e.contactoParentesco),
      `Parentesco no disponible en ${e.clave}.`,
    );
  }
  async empleado(e: EmpleadoDemo) {
    const existentes = await repo.empleadoPorCorreo(this.c, e.correo);
    if (existentes.length) {
      const existente = existentes[0]!;
      exigir(
        this.propias.has(repo.llave('EMPLEADOS', existente.ID)),
        `El correo de ${e.clave} existe sin propiedad demo; se cancela para conservar datos ajenos.`,
      );
      this.empleados.set(e.clave, existente.ID);
      this.contar('EMPLEADOS', 'reutilizados');
      exigir(
        existente.USUARIO && this.propias.has(repo.llave('USUARIOS', existente.USUARIO)),
        `El vínculo de usuario de ${e.clave} fue cambiado; revisa su expediente.`,
      );
      this.contar('USUARIOS', 'reutilizados');
      return;
    }
    const lugar = await this.ubicacion(e.departamentoGt, e.municipioGt);
    const contrato = this.dataset.configuracion.contratos.find((t) => t.clave === e.tipoContrato)!;
    const tipo = await repo.contrato(this.c, contrato.clave, contrato.nombre);
    exigir(tipo, 'Falta un tipo de contrato del proyecto.');
    const ids: Identificadores = {
      departamentoGt: lugar.DEP,
      municipioGt: lugar.ID,
      departamento: this.obtener('departamentos', e.departamento),
      puesto: this.obtener('puestos', e.puesto),
      centroTrabajo: this.obtener('centros-trabajo', e.centroTrabajo),
      horario: this.obtener('horarios', e.horario),
      banco: this.obtener('bancos', e.banco),
      tipoContrato: tipo.ID,
    };
    const d = datosEmpleado(e, ids);
    await this.validarEmpleado(e, d);
    const id = await this.crear('EMPLEADOS', e.clave, async () => {
      const m = await municipio(this.c, lugar.ID);
      exigir(m, 'Municipio no disponible.');
      const direccion = `${d.direccion}${d.zona ? ', zona ' + d.zona : ''}, ${m.nombre}, ${m.departamento}`;
      return empleadosRepo.guardar(
        this.c,
        d,
        this.actor.idUsuario,
        undefined,
        undefined,
        direccion,
      );
    });
    this.empleados.set(e.clave, id);
    if (this.opciones.dryRun) {
      this.contar('USUARIOS', 'previstos');
      const vigencias = this.opciones.withExtras ? (e.extras?.historialSalarial?.length ?? 1) : 1;
      for (let i = 0; i < vigencias; i++) this.contar('HISTORIAL_SALARIAL', 'previstos');
      this.contar('EMPLEADO_HORARIO', 'previstos');
      this.contar('EMPLEADO_CONTACTOS_EMERGENCIA', 'previstos');
      return;
    }
    const rol = await buscarIdRol(this.c, e.rol);
    exigir(rol, 'Rol demo no disponible.');
    const usuario = await generarNombreUsuario(
      this.c,
      e.nombres.split(' ')[0]!,
      e.apellidos.split(' ')[0]!,
    );
    politicaContrasena.parse(this.contrasena);
    const idUsuario = await insertarUsuario(
      this.c,
      usuario,
      e.correo,
      await hashearContrasena(this.contrasena),
      rol,
      this.actor.idUsuario,
    );
    this.recordar('USUARIOS', idUsuario, e.clave);
    await empleadosRepo.vincularUsuario(this.c, id, idUsuario, this.actor.idUsuario);
    const historia =
      this.opciones.withExtras && e.extras?.historialSalarial
        ? e.extras.historialSalarial
        : [
            {
              salarioBase: e.salarioBase,
              vigenteDesde: e.fechaIngreso,
              motivo: 'Salario inicial del conjunto demo.',
            },
          ];
    for (const h of historia)
      await empleadosRepo.agregarHistorial(
        this.c,
        id,
        'salario',
        h.salarioBase,
        h.vigenteDesde,
        h.motivo,
        this.actor.idUsuario,
      );
    await empleadosRepo.agregarHistorial(
      this.c,
      id,
      'horario',
      ids.horario,
      e.fechaIngreso,
      'Horario inicial del conjunto demo.',
      this.actor.idUsuario,
    );
    await this.rastrear('HISTORIAL_SALARIAL', id, e.clave);
    await this.rastrear('EMPLEADO_HORARIO', id, e.clave);
    await this.rastrear('EMPLEADO_CONTACTOS_EMERGENCIA', id, e.clave);
  }
  contrasena = '';
  async ejecutar(contrasena: string) {
    this.contrasena = contrasena;
    const reglas = await empleadosRepo.reglas(this.c);
    this.hoy = reglas.hoy;
    const limites = await catalogosRepo.limitesHorario(this.c);
    exigir(limites, 'Faltan límites de jornada configurados.');
    if (this.opciones.resetDemo) {
      const orden = await repo.ordenarBorrado(this.c, this.propias, !this.opciones.dryRun);
      for (const p of orden) {
        if (!this.opciones.dryRun) {
          await repo.borrar(this.c, p);
          await registrarAuditoria(this.c, {
            actor: this.actor,
            accion: 'SEED_DEMO_BORRAR',
            entidad: p.tabla,
            idEntidad: p.id,
            despues: { conjunto: this.dataset.configuracion.conjunto, clave: p.clave },
            motivo: 'Reset exclusivo de filas demo intactas, sin referencias ajenas.',
          });
        }
        this.contar(p.tabla, this.opciones.dryRun ? 'previstos' : 'eliminados');
      }
      return;
    }
    validarDataset(this.dataset, reglas, limites);
    if (!this.opciones.dryRun) politicaContrasena.parse(contrasena);
    await this.minimo();
    for (const d of this.dataset.departamentos)
      await this.catalogo('departamentos', d.clave, {
        nombre: d.nombre,
        descripcion: d.descripcion ?? null,
      });
    for (const b of this.dataset.bancos)
      await this.catalogo('bancos', b.clave, {
        nombre: b.nombre,
        descripcion: b.descripcion ?? null,
      });
    for (const p of this.dataset.puestos)
      await this.catalogo('puestos', p.clave, {
        nombre: p.nombre,
        descripcion: null,
        idDepartamento: this.obtener('departamentos', p.departamento),
        salarioMinimo: p.salarioMinimo,
        salarioMaximo: p.salarioMaximo,
      });
    for (const h of this.dataset.horarios)
      await this.catalogo('horarios', h.clave, {
        nombre: h.nombre,
        descripcion: null,
        jornada: h.jornada,
        bloques: h.bloques,
      });
    for (const c of this.dataset.centros) {
      const lugar = await this.ubicacion(c.departamentoGt, c.municipioGt);
      const m = await municipio(this.c, lugar.ID);
      exigir(m, 'Municipio de centro no disponible.');
      await this.catalogo('centros-trabajo', c.clave, {
        nombre: c.nombre,
        descripcion: c.descripcion ?? null,
        idDepartamentoGt: lugar.DEP,
        idMunicipioGt: lugar.ID,
        direccion: c.direccion,
        localidad:
          m.codigo === '0101' ? 'GUATEMALA_CIUDAD' : limpiarPalabra(m.nombre).replace(/ /g, '_'),
      });
    }
    for (const e of this.dataset.empleados) await this.empleado(e);
    if (this.opciones.withExtras) await cargarExtras(this);
    if (!this.opciones.dryRun) {
      for (const p of this.nuevas.values())
        await repo.registrarPropiedad(this.c, this.actor, this.dataset.configuracion.conjunto, p);
      for (const key of this.actualizadas) {
        const p = this.propias.get(key)!;
        await repo.registrarPropiedad(
          this.c,
          this.actor,
          this.dataset.configuracion.conjunto,
          p,
          true,
        );
      }
    }
    this.contrasena = '';
    this.avisos.add(
      'Los teléfonos de centros son referencia JSON; el esquema no tiene columna de teléfono.',
    );
  }
}
export async function cargarDemo(
  c: Connection,
  dataset: Dataset,
  opciones: OpcionesDemo,
  contrasena: string,
) {
  await repo.preflight(c);
  const admin = await repo.administrador(c);
  exigir(admin, 'Falta un ADMIN activo. Ejecuta db:seed con las variables ADMIN_* del proyecto.');
  const actor: ActorAuditoria = {
    idUsuario: admin.ID,
    idRol: admin.ROL,
    rol: 'ADMIN',
    ip: '127.0.0.1',
  };
  if (!opciones.dryRun) await catalogosRepo.bloquearCatalogos(c, true);
  const carga = new CargaDemo(
    c,
    dataset,
    opciones,
    actor,
    await repo.propiedades(c, dataset.configuracion.conjunto),
  );
  await carga.ejecutar(contrasena);
  const totales: Partial<Record<Tabla, number>> = {};
  for (const tabla of Object.keys(carga.resumen) as Tabla[])
    totales[tabla] = await repo.contar(c, tabla);
  return {
    modo: opciones.dryRun
      ? 'VALIDACION_SIN_ESCRITURAS'
      : opciones.resetDemo
        ? 'RESET_DEMO'
        : 'CARGA_DEMO',
    tablas: carga.resumen,
    totalesActuales: totales,
    avisos: [...carga.avisos],
    empleadosDemo: carga.empleados.size,
  };
}
