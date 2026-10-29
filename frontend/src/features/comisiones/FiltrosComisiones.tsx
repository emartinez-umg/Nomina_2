import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MonthFieldDatos } from '../../components/forms/MonthFieldDatos';
import { SelectField } from '../../components/forms/SelectField';
import { TextField } from '../../components/forms/TextField';
import { Button } from '../../components/ui/Button';
import { useSession } from '../../app/session';
import { hoyGuatemala } from '../../lib/validadores';
import {
  consultar,
  opcionesSchema,
  comisionesQuerySchema,
  indiceMes,
  mesDeIndice,
  type FiltrosComisiones as Filtros,
} from './api';
export const filtrosIniciales = (): Filtros => ({
  desde: hoyGuatemala().slice(0, 7),
  hasta: hoyGuatemala().slice(0, 7),
  estado: 'todas',
  comparar: 'false',
});
export function validarFiltrosComisiones(q: Filtros) {
  const resultado = comisionesQuerySchema.safeParse(q);
  if (!resultado.success) return resultado.error.issues[0]!.message;
  if (q.hasta > hoyGuatemala().slice(0, 7))
    return 'No se permiten meses futuros. Selecciona un mes hasta el actual.';
  return '';
}
export function FiltrosComisiones({
  aplicados,
  aplicar,
  bloqueado = false,
}: {
  aplicados: Filtros;
  aplicar: (q: Filtros) => void;
  bloqueado?: boolean;
}) {
  const [q, setQ] = useState(aplicados),
    [busqueda, setBusqueda] = useState('');
  const { usuario } = useSession();
  const problema = validarFiltrosComisiones(q);
  // Las opciones no se reducen a los vendedores ya seleccionados; permiten ampliar la selección.
  const opcionesQ = { desde: q.desde, hasta: q.hasta, estado: q.estado, comparar: 'false' };
  const opciones = useQuery({
    queryKey: [
      'comisiones-opciones',
      usuario?.idUsuario,
      usuario?.permisosEquipo,
      opcionesQ,
      q.idDepartamento,
    ],
    queryFn: async ({ signal }) => {
      const [generales, departamento] = await Promise.all([
        consultar('opciones', opcionesSchema, opcionesQ, signal),
        q.idDepartamento
          ? consultar(
              'opciones',
              opcionesSchema,
              { ...opcionesQ, idDepartamento: q.idDepartamento },
              signal,
            )
          : Promise.resolve(undefined),
      ]);
      return { ...generales, vendedores: departamento?.vendedores ?? generales.vendedores };
    },
    enabled: !problema,
    retry: false,
    staleTime: 0,
    refetchInterval: 60000,
  });
  const datos = opciones.error || bloqueado ? undefined : opciones.data;
  const ids = q.vendedores?.split(',') ?? [];
  const cambiar = (nombre: keyof Filtros, valor: string) =>
    setQ((prev) => {
      const siguiente = { ...prev, [nombre]: valor };
      if (['desde', 'hasta', 'estado', 'idDepartamento'].includes(nombre))
        delete siguiente.vendedores;
      if (nombre === 'idDepartamento' && !valor) delete siguiente.idDepartamento;
      if (['desde', 'hasta', 'estado'].includes(nombre)) delete siguiente.idDepartamento;
      return siguiente;
    });
  const normalizar = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const vendedores =
    datos?.vendedores.filter(
      (p) =>
        (!q.idDepartamento || String(p.idDepartamento) === q.idDepartamento) &&
        normalizar(`${p.nombre} ${p.codigo}`).includes(normalizar(busqueda)),
    ) ?? [];
  const atajo = (opcion: string) => {
    const actual = hoyGuatemala().slice(0, 7),
      anio = Number(actual.slice(0, 4));
    const hasta = opcion === 'anterior' ? `${anio - 1}-12` : actual;
    const desde =
      opcion === 'anio'
        ? `${anio}-01`
        : opcion === 'anterior'
          ? `${anio - 1}-01`
          : mesDeIndice(indiceMes(actual) - Number(opcion) + 1);
    const siguiente = { ...q, desde, hasta };
    delete siguiente.vendedores;
    delete siguiente.idDepartamento;
    setQ(siguiente);
    aplicar(siguiente);
  };
  return (
    <section
      className="tarjeta com-filtros"
      data-tour="com-filtros"
      aria-label="Filtros de comisiones"
    >
      <h2>Explorar comisiones</h2>
      <p className="campo-hint">
        Por mes de origen · Comisiones autorizadas · Importes en quetzales
      </p>
      <div className="com-atajos" role="group" aria-label="Atajos de fechas">
        {[
          ['1', 'Este mes'],
          ['3', 'Últimos 3 meses'],
          ['6', 'Últimos 6 meses'],
          ['12', 'Últimos 12 meses'],
          ['anio', 'Este año'],
          ['anterior', 'Año anterior'],
        ].map(([v, texto]) => (
          <Button key={v} icono="calendario" variante="secundario" onClick={() => atajo(v!)}>
            {texto}
          </Button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!problema) aplicar(q);
        }}
      >
        <div className="com-campos">
          {(['desde', 'hasta'] as const).map((nombre) => (
            <MonthFieldDatos
              key={nombre}
              fuente="comisiones"
              name={nombre}
              label={nombre === 'desde' ? 'Desde' : 'Hasta'}
              required
              value={q[nombre]}
              onValueChange={(v) => cambiar(nombre, v)}
              max={hoyGuatemala().slice(0, 7)}
              hint="Mes incluido en el rango. Máximo 60 meses, sin meses futuros."
            />
          ))}
          <SelectField
            name="departamento"
            label="Departamento"
            hint="Solo departamentos con comisiones en el rango y dentro de tu alcance. Cambiarlo limpia los vendedores."
            value={q.idDepartamento ?? ''}
            onValueChange={(v) => cambiar('idDepartamento', v)}
            opciones={[
              { value: '', label: 'Todos los departamentos' },
              ...(datos?.departamentos.map((d) => ({ value: String(d.id), label: d.nombre })) ??
                []),
            ]}
          />
          <SelectField
            name="estado"
            label="Estado de la comisión"
            hint="Pendiente: aún no consumida por nómina. Aplicada: incluida en un pago. Ambas requieren autorización."
            value={q.estado}
            onValueChange={(v) => cambiar('estado', v)}
            opciones={[
              { value: 'todas', label: 'Todas' },
              { value: 'pendientes', label: 'Pendientes' },
              { value: 'aplicadas', label: 'Aplicadas' },
            ]}
          />
        </div>
        <details className="com-vendedores">
          <summary>Vendedores: {ids.length ? `${ids.length} seleccionados` : 'todos'}</summary>
          <TextField
            name="buscar-vendedores"
            label="Buscar vendedores"
            hint="Busca por nombre o código y marca varias personas. Sin selección se incluyen todos los vendedores del alcance."
            value={busqueda}
            onValueChange={setBusqueda}
            maxLength={100}
            placeholder="Nombre o EMP_…"
          />
          <div className="com-lista-vendedores" role="group" aria-label="Seleccionar vendedores">
            {vendedores.map((p) => (
              <label key={p.idEmpleado}>
                <input
                  type="checkbox"
                  checked={ids.includes(String(p.idEmpleado))}
                  onChange={(e) =>
                    setQ((prev) => {
                      const elegidos = prev.vendedores?.split(',') ?? [];
                      const nuevos = e.target.checked
                        ? [...elegidos, String(p.idEmpleado)]
                        : elegidos.filter((id) => id !== String(p.idEmpleado));
                      const next = { ...prev };
                      if (nuevos.length) next.vendedores = nuevos.join(',');
                      else delete next.vendedores;
                      return next;
                    })
                  }
                />
                {p.nombre} · {p.codigo} · {p.departamento}
              </label>
            ))}
            {!vendedores.length && (
              <p>
                {opciones.isPending
                  ? 'Consultando vendedores…'
                  : 'Sin vendedores con comisiones para estos filtros. Prueba otro rango o estado.'}
              </p>
            )}
          </div>
        </details>
        <label className="com-interruptor">
          <input
            type="checkbox"
            role="switch"
            checked={q.comparar === 'true'}
            onChange={(e) => cambiar('comparar', String(e.target.checked))}
          />
          Comparar con el periodo anterior
        </label>
        <p className="campo-hint">
          Compara con igual cantidad de meses inmediatamente anteriores, manteniendo filtros y
          alcance.
        </p>
        {problema && (
          <p role="alert" className="campo-error">
            {problema}
          </p>
        )}
        {opciones.error && (
          <p role="alert">
            {opciones.error.message}{' '}
            <Button icono="actualizar" variante="texto" onClick={() => void opciones.refetch()}>
              Reintentar opciones
            </Button>
          </p>
        )}
        <div className="com-acciones">
          <Button
            icono="filtrar"
            type="submit"
            disabled={!!problema}
            motivoDeshabilitado={problema || undefined}
          >
            Aplicar filtros
          </Button>
          <Button
            icono="cancelar"
            variante="secundario"
            onClick={() => {
              const inicial = filtrosIniciales();
              setQ(inicial);
              setBusqueda('');
              aplicar(inicial);
            }}
          >
            Limpiar filtros
          </Button>
          <span aria-live="polite" className="campo-hint">
            {JSON.stringify(q) !== JSON.stringify(aplicados)
              ? 'Hay filtros por aplicar.'
              : 'Filtros aplicados.'}
          </span>
        </div>
      </form>
    </section>
  );
}
