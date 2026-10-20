import { FormGrid } from '../../../components/forms/FormGrid';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tipos, titulos, listar, exportar } from '../api/novedades';
import type { Tipo, Fila } from '../api/novedades';
import type { Campo } from '../api/formulario';
import { CampoNovedad } from './CampoNovedad';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { TextField } from '../../../components/forms';
import { fechaVisible } from '../../../lib/validadores';
import { formatoMoneda } from '../../../components/forms/MoneyField';
import { descargar } from '../../empleados/api/empleados';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { useSession } from '../../../app/session';
import { useToast } from '../../../components/ui/Toast';
import { ayudaNovedades } from '../help/pasos';
export const tipoValido = (v: string | undefined): v is Tipo => tipos.includes(v as Tipo);
export const moneda = (v: string | null | undefined) => (!v ? '—' : `Q ${formatoMoneda(v)}`);
export const finVisible = (v: string | null) =>
  !v || v === '9999-12-31' ? 'Sin fin' : fechaVisible(v);
export function NavegacionNovedades({ tipo }: { tipo: Tipo }) {
  const nav = useNavigate();
  return (
    <nav
      aria-label="Tipos de novedades"
      data-tour="novedades-tipos"
      className="my-5 flex flex-wrap gap-2"
    >
      {tipos.map((t) => (
        <Button
          key={t}
          icono={t === 'ausencias' ? 'calendario' : 'planilla'}
          variante={tipo === t ? 'primario' : 'secundario'}
          aria-current={tipo === t ? 'page' : undefined}
          onClick={() => nav(`/novedades/${t}`)}
        >
          {titulos[t]}
        </Button>
      ))}
    </nav>
  );
}
export function NovedadesPage() {
  const { tipo } = useParams();
  if (!tipoValido(tipo)) return <Navigate to="/novedades/descuentos" replace />;
  return <Listado key={tipo} tipo={tipo} />;
}
function filtros(tipo: Tipo): Campo[] {
  const desc = ['descuentos', 'prestamos'].includes(tipo);
  const f: Campo[] = [
    {
      nombre: 'idEmpleado',
      label: 'Empleado',
      tipo: 'referencia',
      hint: 'Filtra novedades de un expediente.',
      ref: 'empleados',
    },
    {
      nombre: 'desde',
      label: 'Desde',
      tipo: 'fecha',
      hint: 'Incluye registros cuyo rango cruza esta fecha.',
    },
    { nombre: 'hasta', label: 'Hasta', tipo: 'fecha', hint: 'Última fecha incluida en el rango.' },
  ];
  if (desc || tipo === 'ausencias')
    f.push({
      nombre: 'idTipo',
      label: 'Tipo',
      tipo: 'referencia',
      ref: tipo,
      hint: 'Tipo registrado en Catálogos.',
    });
  if (['comisiones', 'horas-extra', 'consumo-tienda'].includes(tipo))
    f.push({ nombre: 'mes', label: 'Mes', tipo: 'mes', hint: 'Filtra por mes y año.' });
  if (desc || tipo === 'ausencias')
    f.push({
      nombre: 'idPeriodo',
      label: 'Periodo',
      tipo: 'referencia',
      ref: 'periodos',
      hint: 'Quincena registrada en Oracle. También puedes buscar por rango de fechas.',
    });
  f.push({
    nombre: 'estado',
    label: 'Estado',
    tipo: 'opcion',
    opciones: desc
      ? ['VIGENTE', 'LIQUIDADO', 'CANCELADO']
      : ['comisiones', 'horas-extra', 'consumo-tienda'].includes(tipo)
        ? ['PENDIENTE', 'APLICADA']
        : ['PENDIENTE', 'APROBADA', 'RECHAZADA'],
    hint: 'Combina con fechas y empleado para revisar autorizaciones.',
  });
  if (desc)
    f.push({
      nombre: 'modalidad',
      label: 'Modalidad',
      tipo: 'opcion',
      opciones: ['FIJO', 'CUOTAS', 'UNICO'],
      hint: 'Fijo, en cuotas o un único cobro.',
    });
  if (tipo === 'ausencias')
    f.push({
      nombre: 'efecto',
      label: 'Efecto',
      tipo: 'opcion',
      opciones: ['CON_GOCE', 'SIN_GOCE', 'SUBSIDIO_IGSS'],
      hint: 'Efecto configurado en el tipo de ausencia.',
    });
  const rangos = desc
    ? ['monto', 'saldo', 'cuotas']
    : ['comisiones', 'consumo-tienda'].includes(tipo)
      ? ['monto']
      : tipo === 'horas-extra'
        ? ['horas']
        : [];
  for (const key of rangos)
    for (const suf of ['Min', 'Max'])
      f.push({
        nombre: `${key}${suf}`,
        label: `${key === 'cuotas' ? 'Cuotas' : key === 'horas' ? 'Horas' : key === 'saldo' ? 'Saldo' : 'Monto'} ${suf === 'Min' ? 'mínimo' : 'máximo'}`,
        tipo: ['horas', 'cuotas'].includes(key) ? 'numero' : 'dinero',
        hint: 'Límite incluido. Se aplica a toda la consulta en el servidor.',
      });
  return f;
}
function Listado({ tipo }: { tipo: Tipo }) {
  const nav = useNavigate(),
    toast = useToast();
  const { usuario } = useSession();
  const ayuda = useMemo(() => ayudaNovedades(tipo, 'listado'), [tipo]);
  usePageHelp(ayuda, usuario?.rol);
  const [borrador, setBorrador] = useState<Record<string, string>>({}),
    [q, setQ] = useState<Record<string, string>>({}),
    [pagina, setPagina] = useState(1),
    [orden, setOrden] = useState<{ campo: string; direccion: 'asc' | 'desc' }>({
      campo: 'id',
      direccion: 'desc',
    }),
    [exportando, setExportando] = useState(false);
  const query = {
    ...q,
    pagina: String(pagina),
    ordenarPor: orden.campo,
    direccion: orden.direccion,
  };
  const datos = useQuery({
    queryKey: ['novedades', tipo, 'lista', query],
    queryFn: ({ signal }) => listar(tipo, query, signal),
  });
  const defs = filtros(tipo),
    desc = ['descuentos', 'prestamos'].includes(tipo);
  return (
    <>
      <h1>Novedades de nómina</h1>
      <NavegacionNovedades tipo={tipo} />
      <h2>{titulos[tipo]}</h2>
      <p className="my-3 text-secundario">
        Registra y revisa los movimientos antes de calcular el pago.
      </p>
      <div className="my-5 flex flex-wrap gap-3">
        {!['comisiones', 'consumo-tienda'].includes(tipo) && (
          <Button
            icono="configuracion"
            variante="secundario"
            onClick={() =>
              nav(
                `/catalogos/${tipo === 'ausencias' ? 'tipos-ausencia' : tipo === 'horas-extra' ? 'parametros-legales' : 'tipos-descuento'}`,
              )
            }
          >
            {tipo === 'horas-extra' ? 'Configurar recargo, tope y jornadas' : 'Configurar tipos'}
          </Button>
        )}
        <Button icono="crear" onClick={() => nav(`/novedades/${tipo}/nuevo`)}>
          Nuevo registro
        </Button>
        <Button
          icono="exportar"
          variante="secundario"
          cargando={exportando}
          onClick={() => {
            setExportando(true);
            void exportar(tipo, query)
              .then((csv) => descargar(csv, `${tipo}.csv`))
              .catch((e) => toast((e as Error).message, 'peligro'))
              .finally(() => setExportando(false));
          }}
        >
          Exportar CSV
        </Button>
      </div>
      <Card>
        <form
          noValidate
          data-tour="novedades-filtros"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(
              Object.fromEntries(
                Object.entries(borrador)
                  .filter(([, v]) => v !== '')
                  .map(([k, v]) => [k, v.replace(/,/g, '')]),
              ),
            );
            setPagina(1);
          }}
        >
          <TextField
            name="buscar"
            label="Buscar empleado o motivo"
            hint="Busca por nombre, código o descripción y combina filtros."
            value={borrador.buscar ?? ''}
            onValueChange={(v) => setBorrador((d) => ({ ...d, buscar: v }))}
            maxLength={150}
          />
          <details className="my-4">
            <summary className="cursor-pointer text-primario">Filtros avanzados</summary>
            <FormGrid className="my-4">
              {defs.map((f) => (
                <div key={f.nombre} className="contents">
                  <CampoNovedad
                    campo={f}
                    soloActivos={false}
                    name={f.nombre}
                    label={f.label}
                    hint={f.hint}
                    value={borrador[f.nombre] ?? ''}
                    onValueChange={(v) => setBorrador((d) => ({ ...d, [f.nombre]: v }))}
                  />
                </div>
              ))}
            </FormGrid>
          </details>
          <div className="my-4 flex flex-wrap gap-2">
            <Button type="submit" icono="filtrar">
              Aplicar filtros
            </Button>
            <Button
              icono="cancelar"
              variante="texto"
              onClick={() => {
                setQ({});
                setBorrador({});
                setPagina(1);
              }}
            >
              Limpiar filtros
            </Button>
          </div>
          <div role="group" className="my-3 flex flex-wrap gap-2" aria-label="Filtros activos">
            {Object.entries(q).map(([k, v]) => (
              <Button
                key={k}
                icono="cancelar"
                variante="texto"
                onClick={() => {
                  const next = { ...q };
                  delete next[k];
                  setQ(next);
                  setBorrador(next);
                  setPagina(1);
                }}
              >
                {defs.find((f) => f.nombre === k)?.label ?? 'Buscar'}: {v}
              </Button>
            ))}
          </div>
        </form>
        <div data-tour="novedades-tabla">
          <Table<Fila>
            columnas={[
              ...(tipo === 'descuentos' || tipo === 'prestamos'
                ? [
                    {
                      id: 'codigo',
                      titulo: 'Código',
                      ordenable: true,
                      render: (r: Fila) => r.codigo,
                    },
                  ]
                : []),
              {
                id: 'empleado',
                titulo: 'Empleado',
                ordenable: true,
                render: (r) => <strong>{r.empleado}</strong>,
              },
              ...(desc || tipo === 'ausencias'
                ? [{ id: 'tipo', titulo: 'Tipo', render: (r: Fila) => r.tipoNombre }]
                : []),
              {
                id: 'fechaInicio',
                titulo: ['comisiones', 'horas-extra', 'consumo-tienda'].includes(tipo)
                  ? 'Mes'
                  : 'Inicio',
                ordenable: true,
                render: (r) => r.mes ?? fechaVisible(r.fechaInicio),
              },
              { id: 'fin', titulo: 'Fin', render: (r) => finVisible(r.fechaFin) },
              ...(desc
                ? [{ id: 'modalidad', titulo: 'Modalidad', render: (r: Fila) => r.modalidad }]
                : []),
              ...(desc || ['comisiones', 'consumo-tienda'].includes(tipo)
                ? [
                    {
                      id: 'monto',
                      titulo: 'Monto',
                      ordenable: true,
                      render: (r: Fila) => moneda(r.monto),
                    },
                  ]
                : []),
              ...(desc
                ? [
                    {
                      id: 'saldo',
                      titulo: 'Saldo',
                      ordenable: true,
                      render: (r: Fila) => moneda(r.saldo),
                    },
                  ]
                : []),
              ...(tipo === 'horas-extra'
                ? [
                    {
                      id: 'horas',
                      titulo: 'Horas / jornada',
                      render: (r: Fila) => r.horas,
                    },
                    {
                      id: 'estimado',
                      titulo: 'Valor estimado',
                      render: (r: Fila) => moneda(r.calculo?.monto ?? r.monto),
                    },
                  ]
                : []),
              ...(tipo === 'ausencias'
                ? [{ id: 'efecto', titulo: 'Efecto', render: (r: Fila) => r.efecto }]
                : []),
              {
                id: 'estado',
                titulo: 'Estado',
                ordenable: true,
                render: (r) =>
                  r.activo
                    ? `${r.estadoAplicacion ?? r.estado}${r.idPago ? ` · Pago #${r.idPago}` : ''}`
                    : 'ANULADA',
              },
              {
                id: 'acciones',
                titulo: 'Acciones',
                render: (r) => (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      icono="ver"
                      variante="texto"
                      onClick={() => nav(`/novedades/${tipo}/${r.id}`)}
                    >
                      Ver detalle
                    </Button>
                    <Button
                      icono="editar"
                      variante="texto"
                      disabled={
                        r.autorizacion === 'RECHAZADA' ||
                        !!r.bloqueada ||
                        !r.activo ||
                        ['LIQUIDADO', 'CANCELADO'].includes(r.estado)
                      }
                      motivoDeshabilitado={
                        r.autorizacion === 'RECHAZADA'
                          ? 'Se conserva el rechazo del registro v0.'
                          : r.bloqueada
                            ? 'Periodo cerrado o registro consumido por nómina.'
                            : !r.activo || ['LIQUIDADO', 'CANCELADO'].includes(r.estado)
                              ? 'Registro finalizado.'
                              : undefined
                      }
                      onClick={() => nav(`/novedades/${tipo}/${r.id}/editar`)}
                    >
                      Editar
                    </Button>
                  </div>
                ),
              },
            ]}
            filas={datos.data?.registros ?? []}
            clave={(r) => r.id}
            pagina={pagina}
            limite={20}
            total={datos.data?.total ?? 0}
            orden={orden}
            onOrden={(campo, direccion) => {
              setOrden({ campo, direccion });
              setPagina(1);
            }}
            onPagina={setPagina}
            cargando={datos.isPending}
            {...(datos.error ? { error: datos.error.message } : {})}
            onReintentar={() => void datos.refetch()}
          />
        </div>
      </Card>
    </>
  );
}
