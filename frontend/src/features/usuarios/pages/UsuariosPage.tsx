import { useFormDraft } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as api from '../api/usuarios';
import type { Usuario } from '../api/usuarios';
import { ayudaUsuarios } from '../help/pasos';
import { useSession } from '../../../app/session';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Table } from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';
import { Modal, ConfirmModal } from '../../../components/ui/Modal';
import {
  TextField,
  EmailField,
  SelectField,
  TextAreaField,
  FormErrorSummary,
} from '../../../components/forms';
import { useToast } from '../../../components/ui/Toast';
import { mapearErrores } from '../../../lib/http';
import { Credenciales } from '../../empleados/pages/Credenciales';
const roles = ['ADMIN', 'RH', 'EMPLEADO'].map((v) => ({ value: v, label: v }));
const inicial = { pagina: '1', limite: '10', ordenarPor: 'usuario', direccion: 'asc' };
export function UsuariosPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaUsuarios, usuario?.rol);
  const [q, setQ] = useState<Record<string, string>>(inicial),
    [accion, setAccion] = useState<{ tipo: string; usuario?: Usuario }>();
  const [filtros, setFiltros] = useState(false);
  const datos = useQuery({ queryKey: ['usuarios', q], queryFn: () => api.listar(q) });
  const toast = useToast();
  const exportar = useMutation({
    mutationFn: async () => {
      const filas: Usuario[] = [];
      for (let pagina = 1; ; pagina++) {
        const lote = await api.listar({ ...q, pagina: String(pagina), limite: '100' });
        if (lote.total > 10000)
          throw new Error('Limita los filtros a 10,000 usuarios antes de exportar.');
        filas.push(...lote.usuarios);
        if (filas.length >= lote.total) break;
      }
      const celda = (v: unknown) =>
        `"${String(v ?? '')
          .replace(/^[=+@-]/, "'$&")
          .replace(/"/g, '""')}"`;
      const csv = [
        'Usuario,Correo,Rol,Activo,Cambio obligatorio',
        ...filas.map((u) =>
          [u.usuario, u.correo, u.rol, u.activo, u.cambioObligatorio].map(celda).join(','),
        ),
      ].join('\r\n');
      const url = URL.createObjectURL(
        new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
      );
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'usuarios.csv';
      enlace.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast(e.message, 'peligro'),
  });
  return (
    <>
      <h1>Usuarios y roles</h1>
      <p className="text-secundario mb-5">
        Controla accesos; los cambios revocan las sesiones del usuario afectado.
      </p>
      <Card data-tour="usuarios-filtros" className="mb-5">
        <Button
          icono="filtrar"
          variante="secundario"
          aria-expanded={filtros}
          onClick={() => setFiltros((v) => !v)}
        >
          Filtros de usuarios
        </Button>
        {filtros && (
          <div className="form-grid mt-4">
            {['usuario', 'correo'].map((k) => (
              <TextField
                key={k}
                name={k}
                label={k === 'usuario' ? 'Usuario' : 'Correo'}
                hint="Busca una parte del dato. Los filtros se combinan."
                value={q[k] ?? ''}
                onValueChange={(v) => setQ((p) => ({ ...p, [k]: v, pagina: '1' }))}
              />
            ))}
            {[
              ['rol', 'Rol', roles],
              [
                'activo',
                'Estado',
                [
                  { value: '1', label: 'Activo' },
                  { value: '0', label: 'Inactivo' },
                ],
              ],
              [
                'cambioObligatorio',
                'Cambio obligatorio',
                [
                  { value: '1', label: 'Pendiente' },
                  { value: '0', label: 'Completado' },
                ],
              ],
            ].map(([k, label, opciones]) => (
              <SelectField
                key={String(k)}
                name={String(k)}
                label={String(label)}
                hint="Selecciona una opción; limpiar permite consultar todos."
                value={q[String(k)] ?? ''}
                opciones={opciones as { value: string; label: string }[]}
                onValueChange={(v) => setQ((p) => ({ ...p, [String(k)]: v, pagina: '1' }))}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 my-4">
          {Object.entries(q)
            .filter(([k, v]) => !Object.keys(inicial).includes(k) && v)
            .map(([k, v]) => (
              <Button
                key={k}
                icono="cancelar"
                variante="secundario"
                aria-label={`Quitar filtro ${k}`}
                onClick={() => setQ((p) => ({ ...p, [k]: '', pagina: '1' }))}
              >
                {k}: {v}
              </Button>
            ))}
          <Button icono="cancelar" variante="texto" onClick={() => setQ(inicial)}>
            Limpiar filtros
          </Button>
        </div>
      </Card>
      <Card data-tour="usuarios-listado">
        <div className="flex flex-wrap gap-3 mb-5">
          <Button icono="crear" onClick={() => setAccion({ tipo: 'crear' })}>
            Crear acceso
          </Button>
          <Button
            icono="exportar"
            variante="secundario"
            cargando={exportar.isPending}
            onClick={() => exportar.mutate()}
          >
            Exportar CSV
          </Button>
        </div>
        <Table
          titulo="Usuarios del sistema"
          filas={datos.data?.usuarios ?? []}
          total={datos.data?.total ?? 0}
          pagina={Number(q.pagina)}
          limite={10}
          clave={(u) => u.idUsuario}
          cargando={datos.isPending}
          error={datos.error?.message ?? ''}
          onReintentar={() => void datos.refetch()}
          orden={{ campo: q.ordenarPor!, direccion: q.direccion as 'asc' | 'desc' }}
          onPagina={(v) => setQ((p) => ({ ...p, pagina: String(v) }))}
          onOrden={(campo, direccion) =>
            setQ((p) => ({ ...p, ordenarPor: campo, direccion, pagina: '1' }))
          }
          columnas={[
            ...(['usuario', 'correo', 'rol'] as const).map((k) => ({
              id: k,
              titulo: { usuario: 'Usuario', correo: 'Correo', rol: 'Rol' }[k],
              ordenable: true,
              render: (u: Usuario) => u[k],
            })),
            {
              id: 'activo',
              titulo: 'Estado',
              ordenable: true,
              render: (u) => (
                <Badge tono={u.activo ? 'correcto' : 'aviso'}>
                  {u.activo ? 'Activo' : 'Inactivo'}
                  {u.cambioObligatorio ? ' · Cambio pendiente' : ''}
                </Badge>
              ),
            },
            {
              id: 'acciones',
              titulo: 'Acciones',
              render: (u) => (
                <div className="flex flex-wrap gap-2">
                  {[
                    ['rol', 'Cambiar rol', 'editar'],
                    ['estado', u.activo ? 'Desactivar' : 'Activar', 'seguridad'],
                    ['restablecer-contrasena', 'Restablecer contraseña', 'seguridad'],
                  ].map(([tipo, label, icono]) => (
                    <Button
                      key={tipo}
                      icono={icono as 'editar' | 'seguridad'}
                      variante="secundario"
                      onClick={() => setAccion({ tipo: tipo!, usuario: u })}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {accion && <Editor accion={accion} cerrar={() => setAccion(undefined)} />}
    </>
  );
}
const schema = z.object({
  nombre: z.string().trim().min(1, 'Ingresa el nombre.').max(120),
  apellido: z.string().trim().min(1, 'Ingresa el apellido.').max(120),
  correo: z.string().email('Ingresa un correo válido.').max(254),
  rol: z.enum(['ADMIN', 'RH', 'EMPLEADO']),
  motivo: z.string().trim().min(5, 'Explica el motivo con al menos cinco caracteres.').max(1000),
});
function Editor({
  accion,
  cerrar,
}: {
  accion: { tipo: string; usuario?: Usuario };
  cerrar: () => void;
}) {
  const nuevo = accion.tipo === 'crear',
    cache = useQueryClient(),
    toast = useToast();
  const [confirmar, setConfirmar] = useState(false),
    [clave, setClave] =
      useState<{ usuario: string; contrasenaTemporal: string; idUsuario: number }[]>();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(nuevo ? schema : schema.pick({ rol: true, motivo: true })),
    mode: 'onBlur',
    defaultValues: {
      nombre: '',
      apellido: '',
      correo: '',
      rol: accion.usuario?.rol ?? 'RH',
      motivo: '',
    },
  });
  const draft = useFormDraft(`usuario-${accion.tipo}`, accion.usuario?.idUsuario, {
    form,
    version: 1,
    alDescartar: () => setConfirmar(false),
  });
  const m = useMutation({
    mutationFn: async () => {
      const d = form.getValues();
      if (nuevo) {
        const r = await api.crear({ ...d, confirmado: true });
        setClave([r]);
        return { credencialEntregada: true };
      }
      const r = await api.modificar(accion.usuario!.idUsuario, accion.tipo, {
        motivo: d.motivo,
        ...(accion.tipo === 'rol'
          ? { rol: d.rol }
          : accion.tipo === 'estado'
            ? { activo: !accion.usuario!.activo }
            : {}),
      });
      if (r.contrasenaTemporal)
        setClave([
          {
            idUsuario: accion.usuario!.idUsuario,
            usuario: accion.usuario!.usuario,
            contrasenaTemporal: r.contrasenaTemporal,
          },
        ]);
      return { credencialEntregada: !!r.contrasenaTemporal };
    },
    onSuccess: (r) => {
      draft.limpiar();
      void cache.invalidateQueries({ queryKey: ['usuarios'] });
      toast('Cambio de acceso registrado y auditado.');
      setConfirmar(false);
      if (!r.credencialEntregada) cerrar();
    },
    onError: (e) => {
      setConfirmar(false);
      mapearErrores(e, form.setError, ['nombre', 'apellido', 'correo', 'rol', 'motivo']);
    },
  });
  return (
    <Modal
      abierto
      titulo={nuevo ? 'Crear acceso administrativo' : `${accion.usuario?.usuario} · ${accion.tipo}`}
      onCerrar={() => {
        if (!m.isPending) cerrar();
      }}
    >
      {clave ? (
        <Credenciales datos={clave} onCerrar={cerrar} />
      ) : (
        <form
          data-tour="usuarios-formulario"
          className="my-5"
          noValidate
          onSubmit={form.handleSubmit(() => setConfirmar(true))}
        >
          <FormDraftNotice draft={draft} />
          <p className="alerta">
            {nuevo
              ? 'ADMIN y RH se crean aquí. Crea usuarios de empleados desde su expediente.'
              : 'Esta acción cerrará todas las sesiones del usuario afectado. El último ADMIN activo está protegido.'}
          </p>
          <div className="form-grid">
            {(nuevo
              ? ['nombre', 'apellido', 'correo', 'rol', 'motivo']
              : accion.tipo === 'rol'
                ? ['rol', 'motivo']
                : ['motivo']
            ).map((name) => (
              <Controller
                key={name}
                control={form.control}
                name={name as keyof z.infer<typeof schema>}
                render={({ field, fieldState }) => {
                  const p = {
                    name: field.name,
                    value: field.value,
                    onValueChange: field.onChange,
                    onBlur: field.onBlur,
                    error: fieldState.error?.message,
                    required: true,
                  };
                  return name === 'rol' ? (
                    <SelectField
                      {...p}
                      label="Rol autorizado"
                      hint="ADMIN tiene control total. RH gestiona personal y nómina."
                      opciones={nuevo ? roles.filter((r) => r.value !== 'EMPLEADO') : roles}
                    />
                  ) : name === 'correo' ? (
                    <EmailField
                      {...p}
                      label="Correo"
                      hint="Correo único de acceso; se conserva separado del expediente."
                    />
                  ) : name === 'motivo' ? (
                    <TextAreaField
                      {...p}
                      label="Motivo"
                      hint="Justifica el alta o modificación, al menos cinco caracteres."
                      maxLength={1000}
                    />
                  ) : (
                    <TextField
                      {...p}
                      tipo="nombre"
                      label={name === 'nombre' ? 'Nombre' : 'Apellido'}
                      hint="Se usa para generar nombre.apellido, sin acentos, con sufijo si existe."
                      maxLength={120}
                    />
                  );
                }}
              />
            ))}
          </div>
          <FormErrorSummary
            mensajes={Object.values(form.formState.errors).map((e) => e.message)}
            mensajeServidor={m.error?.message}
          />
          <Button type="submit" icono="guardar" cargando={m.isPending}>
            Revisar cambio de acceso
          </Button>
          <ConfirmModal
            abierto={confirmar}
            titulo="Confirmar cambio de acceso"
            descripcion={`Revisa ${nuevo ? `${form.getValues('nombre')} ${form.getValues('apellido')}` : accion.usuario?.usuario} y rol ${form.getValues('rol')}. Se registrará el motivo y se revocarán las sesiones afectadas. Entrega la contraseña temporal en privado cuando corresponda.`}
            onConfirmar={() => m.mutate()}
            onCancelar={() => setConfirmar(false)}
            cargando={m.isPending}
          />
        </form>
      )}
    </Modal>
  );
}
