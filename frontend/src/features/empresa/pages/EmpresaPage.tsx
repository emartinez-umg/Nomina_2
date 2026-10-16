import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useSession } from '../../../app/session';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ConfirmModal } from '../../../components/ui/Modal';
import {
  TextField,
  NitField,
  PhoneField,
  EmailField,
  TextAreaField,
  FileField,
  FormErrorSummary,
} from '../../../components/forms';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useFormDraft } from '../../../hooks/useFormDraft';
import { useToast } from '../../../components/ui/Toast';
import { mapearErrores } from '../../../lib/http';
import * as api from '../api/empresa';
import { ayudaEmpresa } from '../help/pasos';
const vacio: api.FormularioEmpresa = {
  razonSocial: '',
  nombreComercial: '',
  nit: '',
  direccion: '',
  telefono: '',
  correo: '',
  sitioWeb: '',
};
export function EmpresaPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaEmpresa, usuario?.rol);
  const q = useQuery({
    queryKey: ['empresa'],
    queryFn: ({ signal }) => api.consultarEmpresa(signal),
  });
  return (
    <>
      <nav aria-label="Migas de pan">
        <Link to="/catalogos">Configuración</Link> / Configuración de empresa
      </nav>
      <h1>Configuración de empresa</h1>
      <p className="mb-5 text-secundario">Identidad y membrete de los documentos de nómina.</p>
      {q.isPending ? (
        <Skeleton lineas={6} />
      ) : q.error ? (
        <div role="alert">
          {q.error.message}
          <Button icono="actualizar" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <Editor key={q.data?.version ?? 0} empresa={q.data ?? null} />
      )}
    </>
  );
}
function Editor({ empresa }: { empresa: api.Empresa | null }) {
  const cache = useQueryClient(),
    toast = useToast();
  const f = useForm<api.FormularioEmpresa>({
    resolver: zodResolver(api.formularioEmpresa),
    mode: 'onBlur',
    defaultValues: empresa
      ? {
          razonSocial: empresa.razonSocial,
          nombreComercial: empresa.nombreComercial ?? '',
          nit: empresa.nit,
          direccion: empresa.direccion,
          telefono: empresa.telefono ?? '',
          correo: empresa.correo ?? '',
          sitioWeb: empresa.sitioWeb ?? '',
        }
      : vacio,
  });
  const draft = useFormDraft('configuracion-empresa', empresa?.id, { form: f, version: 1 });
  const [logo, setLogo] = useState<{ mime: string; base64: string } | null | undefined>();
  const [errorLogo, setErrorLogo] = useState<string>();
  const [leyendo, setLeyendo] = useState(false);
  const [quitar, setQuitar] = useState(false);
  const estado = useQuery({
    queryKey: ['empresa', 'estado'],
    queryFn: ({ signal }) => api.estadoEmpresa(signal),
  });
  const actual = logo === undefined ? empresa?.logo : logo;
  const datos = f.watch();
  const m = useMutation({
    mutationFn: (d: api.FormularioEmpresa) =>
      api.guardarEmpresa({
        ...d,
        version: empresa?.version ?? 0,
        ...(logo !== undefined ? { logo } : {}),
      }),
    onSuccess: () => {
      draft.limpiar();
      toast('Configuración de empresa guardada.');
      void cache.invalidateQueries({ queryKey: ['empresa'] });
    },
    onError: (e) =>
      mapearErrores(e, f.setError, Object.keys(vacio) as (keyof api.FormularioEmpresa)[]),
  });
  const campos: [keyof api.FormularioEmpresa, string, string, string][] = [
    [
      'razonSocial',
      'Razón social',
      'Nombre legal según el RTU, hasta 200 caracteres.',
      'Empresa, S. A.',
    ],
    [
      'nombreComercial',
      'Nombre comercial',
      'Nombre utilizado en el membrete; opcional.',
      'Nombre comercial',
    ],
    ['nit', 'NIT', 'NIT del RTU con dígito verificador. Ejemplo: 1234567-9.', '1234567-9'],
    [
      'direccion',
      'Dirección fiscal',
      'Dirección completa que aparecerá en el encabezado, hasta 500 caracteres.',
      'Calle, número, zona y municipio',
    ],
    ['telefono', 'Teléfono', 'Ocho dígitos, sin código de país.', '5555 1234'],
    [
      'correo',
      'Correo institucional',
      'Contacto de empresa que aparecerá al pie de los documentos.',
      'rh@empresa.com',
    ],
    [
      'sitioWeb',
      'Sitio web',
      'URL completa con https:// o http://; opcional.',
      'https://empresa.com',
    ],
  ];
  return (
    <form
      noValidate
      onSubmit={f.handleSubmit((d) => {
        if (!leyendo && !errorLogo) m.mutate(d);
      })}
    >
      <FormDraftNotice draft={draft} />
      <Card data-tour="empresa-datos">
        <h2>Datos de empresa</h2>
        <div className="form-grid">
          {campos.map(([name, label, hint, placeholder]) => (
            <Controller
              key={name}
              control={f.control}
              name={name}
              render={({ field, fieldState }) => {
                const props = {
                  name,
                  label,
                  hint,
                  placeholder,
                  value: field.value,
                  onValueChange: field.onChange,
                  onBlur: field.onBlur,
                  error: fieldState.error?.message,
                  required: !['nombreComercial', 'sitioWeb'].includes(name),
                };
                return name === 'nit' ? (
                  <NitField {...props} />
                ) : name === 'telefono' ? (
                  <PhoneField {...props} />
                ) : name === 'correo' ? (
                  <EmailField {...props} />
                ) : name === 'direccion' ? (
                  <TextAreaField {...props} maxLength={500} />
                ) : (
                  <TextField
                    {...props}
                    maxLength={name === 'sitioWeb' ? 300 : 200}
                    ancho={name === 'sitioWeb' ? 'ancho' : 'medio'}
                  />
                );
              }}
            />
          ))}
        </div>
      </Card>
      <Card data-tour="empresa-logo" className="mt-5">
        <h2>Logo de la empresa</h2>
        <FileField
          name="logo"
          label="Logo"
          hint="PNG, JPG o SVG de hasta 2 MB. Se valida y guarda como imagen privada. No se incluye en borradores."
          accept="image/png,image/jpeg,image/svg+xml"
          maxBytes={2 * 1024 * 1024}
          disabled={m.isPending || leyendo}
          {...(errorLogo ? { error: errorLogo } : {})}
          onValueChange={(file) => {
            setErrorLogo(undefined);
            if (!file) {
              setLogo(undefined);
              return;
            }
            setLeyendo(true);
            void api
              .leerLogo(file)
              .then(setLogo)
              .catch((e: Error) => {
                setErrorLogo(e.message);
                setLogo(undefined);
              })
              .finally(() => setLeyendo(false));
          }}
        />
        {actual && (
          <>
            <img
              alt="Vista previa del logo"
              className="my-4 h-24 max-w-full object-contain"
              src={`data:${actual.mime};base64,${actual.base64}`}
            />
            <Button icono="eliminar" variante="secundario" onClick={() => setQuitar(true)}>
              Quitar logo
            </Button>
          </>
        )}
        <p className="mt-3 text-secundario">
          El logo es opcional. Los datos de empresa son obligatorios para emitir documentos.
        </p>
      </Card>
      <Card data-tour="empresa-vista-previa" className="mt-5">
        <h2>Vista previa del membrete</h2>
        <div className="my-4 border-b pb-4">
          {actual && (
            <img alt="" className="mb-3 h-16" src={`data:${actual.mime};base64,${actual.base64}`} />
          )}
          <strong>{datos.razonSocial || 'Completa la razón social'}</strong>
          <p>{datos.nombreComercial}</p>
          <p>NIT: {datos.nit}</p>
          <p>{datos.direccion}</p>
        </div>
        <p>
          {datos.telefono} | {datos.correo}
        </p>
        <p>{datos.sitioWeb}</p>
      </Card>
      <Card data-tour="empresa-firma" className="mt-5">
        <h2>Firma de aprobación</h2>
        <p>
          {estado.data?.firmante
            ? `${estado.data.firmante.nombre} · ${estado.data.firmante.cargo}`
            : 'Para aprobar documentos, ADMIN debe vincular tu usuario a una ficha de empleado con nombres, apellidos y puesto activo.'}
        </p>
      </Card>
      <FormErrorSummary
        mensajes={[...Object.values(f.formState.errors).map((e) => e.message), errorLogo]}
        mensajeServidor={m.error?.message}
      />
      <div data-tour="empresa-guardar" className="my-5">
        <Button
          type="submit"
          icono="guardar"
          cargando={m.isPending}
          disabled={leyendo || !!errorLogo}
          motivoDeshabilitado="Espera la lectura del logo y corrige sus errores."
        >
          Guardar configuración
        </Button>
      </div>
      <ConfirmModal
        abierto={quitar}
        titulo="Quitar logo"
        descripcion="Los próximos documentos usarán el membrete con los datos de empresa y sin imagen. Guarda la configuración para aplicar el cambio."
        onCancelar={() => setQuitar(false)}
        onConfirmar={() => {
          setLogo(null);
          setQuitar(false);
        }}
      />
    </form>
  );
}
