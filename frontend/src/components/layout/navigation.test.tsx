import { isValidElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { matchPath } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { rutas } from '../../app/router';
import { RequireSession } from '../../app/guards';
import { AppLayout } from './AppLayout';
import type { Rol } from '../../features/auth/api/auth';
import { accesoActivo, navigation, opcionesNavegacion } from './navigation.config';
import { guardarReciente, leerRecientes } from './navigation.history';
import { puntuarBusqueda } from './navigation.search';

const roles: Rol[] = ['ADMIN', 'RH', 'EMPLEADO'];
function rutasPorRol() {
  const protegidas: Record<Rol, string[]> = { ADMIN: [], RH: [], EMPLEADO: [] };
  function recorrer(ramas: RouteObject[], permitidos: Rol[] = [], layout = false) {
    for (const rama of ramas) {
      const elemento = rama.element;
      const actuales =
        isValidElement<{ roles?: Rol[] }>(elemento) && elemento.type === RequireSession
          ? (elemento.props.roles ?? permitidos)
          : permitidos;
      const enLayout = layout || (isValidElement(elemento) && elemento.type === AppLayout);
      if (rama.path && enLayout) for (const rol of actuales) protegidas[rol].push(rama.path);
      if (rama.children) recorrer(rama.children, actuales, enLayout);
    }
  }
  recorrer(rutas);
  return protegidas;
}
beforeEach(() => localStorage.clear());
describe('Configuración única de navegación', () => {
  const protegidas = rutasPorRol();
  it.each(roles)(
    'cubre todas las rutas protegidas de %s y solo ofrece rutas autorizadas reales',
    (rol) => {
      const opciones = opcionesNavegacion(rol);
      expect(new Set(opciones.map((opcion) => opcion.id)).size).toBe(opciones.length);
      for (const opcion of opciones) {
        const publica = opcion.ruta === '/salud' && rol === 'ADMIN';
        expect(
          publica || protegidas[rol].some((ruta) => matchPath(ruta, opcion.ruta)),
          opcion.ruta,
        ).toBe(true);
        expect(opcion.descripcion.length).toBeGreaterThan(10);
      }
      for (const ruta of protegidas[rol]) {
        const raiz = ruta.split('/:')[0]!;
        expect(
          opciones.some(
            (opcion) =>
              matchPath(ruta, opcion.ruta) ||
              opcion.ruta === raiz ||
              raiz.startsWith(`${opcion.ruta}/`),
          ),
          ruta,
        ).toBe(true);
      }
      for (const otro of roles.filter((r) => r !== rol)) {
        for (const exclusiva of protegidas[otro].filter(
          (ruta) => !protegidas[rol].includes(ruta),
        )) {
          expect(
            opciones.some((opcion) => matchPath(exclusiva, opcion.ruta)),
            exclusiva,
          ).toBe(false);
        }
      }
    },
  );
  it('incluye los trece catálogos y las cinco novedades existentes para RH y ADMIN', () => {
    for (const rol of ['RH', 'ADMIN'] as const) {
      const destinos = opcionesNavegacion(rol).map((opcion) => opcion.ruta);
      for (const slug of [
        'empresa',
        'bancos',
        'centros-trabajo',
        'departamentos',
        'puestos',
        'jefaturas',
        'horarios',
        'feriados',
        'tipos-ausencia',
        'tipos-descuento',
        'tipos-contrato',
        'parametros-legales',
        'tramos-isr',
      ])
        expect(destinos).toContain(`/catalogos/${slug}`);
      for (const tipo of ['descuentos', 'prestamos', 'comisiones', 'horas-extra', 'ausencias'])
        expect(destinos).toContain(`/novedades/${tipo}`);
    }
    expect(navigation.EMPLEADO.map((grupo) => grupo.titulo)).toEqual([
      'Inicio',
      'Mis gestiones',
      'Vacaciones',
      'Anuncios y eventos',
      'Mis datos',
    ]);
  });
  it('resalta únicamente el destino más específico, incluidos detalle y edición', () => {
    expect(accesoActivo('RH', '/catalogos/puestos')).toBe('puestos');
    expect(accesoActivo('RH', '/empleados/carga-masiva')).toBe('carga-masiva');
    expect(accesoActivo('RH', '/empleados/10/editar')).toBe('empleados');
    expect(accesoActivo('RH', '/novedades/comisiones/1')).toBe('comisiones');
    expect(accesoActivo('EMPLEADO', '/mis-gestiones/vacaciones')).toBe('mis-vacaciones');
    expect(accesoActivo('EMPLEADO', '/admin')).toBeUndefined();
  });
});
describe('Búsqueda tolerante con sinónimos', () => {
  it.each(['boleta', 'boltea', 'boletta', 'nomina', 'nómina', 'salario', 'pagos', 'reporte igss'])(
    'encuentra Planilla con %s',
    (consulta) => {
      const opcion = opcionesNavegacion('RH').find((item) => item.id === 'planilla')!;
      expect(
        puntuarBusqueda(opcion.id, consulta, [opcion.titulo, ...opcion.palabras]),
      ).toBeGreaterThan(0);
    },
  );
  it('requiere todos los términos y evita coincidencias ajenas o demasiado cortas', () => {
    expect(puntuarBusqueda('planilla', 'boleta inexistente', ['boleta'])).toBe(0);
    expect(puntuarBusqueda('planilla', 'xyz')).toBe(0);
    expect(puntuarBusqueda('horarios', 'horraios')).toBeGreaterThan(0);
  });
});
describe('Historial por usuario', () => {
  it('conserva cinco accesos únicos, recientes primero y aislados por usuario y permisos', () => {
    const opciones = opcionesNavegacion('ADMIN');
    for (const id of [
      'inicio',
      'usuarios',
      'bitacora',
      'planilla',
      'empleados',
      'comisiones',
      'planilla',
    ])
      guardarReciente(1, id, opciones);
    expect(leerRecientes(1, opciones)).toEqual([
      'planilla',
      'comisiones',
      'empleados',
      'bitacora',
      'usuarios',
    ]);
    expect(leerRecientes(2, opciones)).toEqual([]);
    expect(leerRecientes(1, opcionesNavegacion('RH'))).toEqual([
      'planilla',
      'comisiones',
      'empleados',
    ]);
    expect(leerRecientes(1, opcionesNavegacion('EMPLEADO'))).toEqual([]);
  });
  it('tolera datos inválidos y almacenamiento bloqueado o lleno', () => {
    localStorage.setItem('nomina2:navegacion:v1:1', 'invalido');
    expect(leerRecientes(1, [])).toEqual([]);
    localStorage.setItem(
      'nomina2:navegacion:v1:1',
      JSON.stringify(['usuarios', 1, 'https://ajeno.test', 'usuarios']),
    );
    expect(leerRecientes(1, opcionesNavegacion('ADMIN'))).toEqual(['usuarios']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Lleno');
    });
    expect(guardarReciente(1, 'planilla', opcionesNavegacion('RH'))).toEqual(['planilla']);
  });
});
