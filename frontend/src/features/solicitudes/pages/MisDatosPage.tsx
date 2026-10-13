import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import * as api from '../api/solicitudes';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaDatos } from '../help/pasos';
import { useSession } from '../../../app/session';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ConfirmModal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import {
  TextField,
  TextAreaField,
  DpiField,
  NitField,
  PhoneField,
  EmailField,
  SelectField,
  FormErrorSummary,
} from '../../../components/forms';
import {
  dpiSchema,
  nitSchema,
  telefonoSchema,
  correoSchema,
  formatearDpi,
  formatearTelefono,
} from '../../../lib/validadores';
import { mapearErrores } from '../../../lib/http';
const nombre = z
  .string()
  .trim()
  .min(1, 'Escribe el nombre completo.')
  .max(100)
  .regex(/^[\p{L}\p{M} '-]+$/u, 'Usa letras, espacios, apóstrofo o guion.');
const criticos = z.object({
  nombres: nombre,
  apellidos: nombre,
  dpi: dpiSchema,
  nit: nitSchema,
  estadoCivil: z.enum(['SOLTERO', 'CASADO', 'UNIDO', 'DIVORCIADO', 'VIUDO']),
});
const contacto = z.object({
  telefono: telefonoSchema,
  direccion: z.string().trim().min(1, 'Escribe tu dirección.').max(500),
  correo: correoSchema,
  contactoNombre: nombre.max(200),
  contactoParentesco: z.string().trim().min(1, 'Indica el parentesco.').max(60),
  contactoTelefono: telefonoSchema,
});
const etiquetas: Record<string, string> = {
  telefono: 'Teléfono',
  direccion: 'Dirección',
  correo: 'Correo electrónico',
  contactoNombre: 'Nombre del contacto de emergencia',
  contactoParentesco: 'Parentesco',
  contactoTelefono: 'Teléfono de emergencia',
  nombres: 'Nombres',
  apellidos: 'Apellidos',
  dpi: 'DPI',
  nit: 'NIT',
  estadoCivil: 'Estado civil',
};
export function MisDatosPage() {
  const { usuario } = useSession();
  usePageHelp(ayudaDatos, usuario?.rol);
  const q = useQuery({
    queryKey: ['solicitudes', 'mis-datos'],
    queryFn: ({ signal }) => api.misDatos(signal),
  });
  return (
    <>
      <h1>Mis datos</h1>
      <p className="mb-6 text-secundario">
        Mantén tu contacto actualizado y solicita la revisión de tus datos críticos.
      </p>
      {q.isPending ? (
        <Skeleton lineas={8} />
      ) : q.error ? (
        <>
          <p role="alert">{q.error.message}</p>
          <Button icono="actualizar" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        </>
      ) : (
        q.data && (
          <>
            <DatosForm
              key={`contacto:${JSON.stringify(q.data.contacto)}`}
              inicial={q.data.contacto}
              tipo="contacto"
            />
            <DatosForm
              key={`criticos:${JSON.stringify(q.data.criticos)}`}
              inicial={q.data.criticos}
              tipo="criticos"
            />
          </>
        )
      )}
    </>
  );
}
function DatosForm({
  inicial,
  tipo,
}: {
  inicial: Record<string, string>;
  tipo: 'contacto' | 'criticos';
}) {
  const cache = useQueryClient(),
    toast = useToast(),
    [confirmar, setConfirmar] = useState(false);
  const f = useForm<Record<string, string>>({
    defaultValues: Object.fromEntries(
      Object.entries(inicial).map(([key, v]) => [
        key,
        key.toLowerCase().includes('telefono')
          ? formatearTelefono(v)
          : key === 'dpi'
            ? formatearDpi(v)
            : v,
      ]),
    ),
    resolver: zodResolver(tipo === 'contacto' ? contacto : criticos),
    mode: 'onBlur',
  });
  const m = useMutation({
    mutationFn: async (): Promise<unknown> =>
      tipo === 'contacto'
        ? api.contacto(contacto.parse(f.getValues()))
        : api.crear({
            tipo: 'ACTUALIZACION_DATOS',
            datos: criticos.parse(f.getValues()),
            confirmado: true,
          }),
    onSuccess: () => {
      toast(
        tipo === 'contacto'
          ? 'Contacto actualizado y auditado.'
          : 'Solicitud de datos críticos enviada a RRHH.',
      );
      void cache.invalidateQueries({ queryKey: ['solicitudes'] });
      void cache.invalidateQueries({ queryKey: ['notificaciones'] });
      setConfirmar(false);
      f.reset(f.getValues());
    },
    onError: (e) => {
      mapearErrores(e, f.setError, Object.keys(inicial));
      setConfirmar(false);
    },
  });
  return (
    <Card className="mb-6" data-tour={`mis-datos-${tipo}`}>
      <h2>{tipo === 'contacto' ? 'Contacto y emergencia' : 'Datos críticos'}</h2>
      <p className="mb-5">
        {tipo === 'contacto'
          ? 'Los cambios se aplican directamente y se registran en la bitácora.'
          : 'Tu expediente conservará los datos actuales hasta que RRHH apruebe la solicitud.'}
      </p>
      <form onSubmit={f.handleSubmit(() => setConfirmar(true))}>
        <div className="form-grid">
          {Object.keys(inicial).map((key) => (
            <Controller
              key={key}
              control={f.control}
              name={key}
              render={({ field: { ref: _ref, ...field }, fieldState }) => {
                const props = {
                  name: key,
                  label: etiquetas[key]!,
                  required: true,
                  value: field.value ?? '',
                  onValueChange: field.onChange,
                  onBlur: field.onBlur,
                  error: fieldState.error?.message,
                  disabled: m.isPending,
                };
                if (key.toLowerCase().includes('telefono'))
                  return (
                    <PhoneField
                      {...props}
                      hint="Ocho dígitos sin código de país, por ejemplo 5555 1234."
                    />
                  );
                if (key === 'correo')
                  return (
                    <EmailField
                      {...props}
                      hint="Correo personal para comunicaciones: nombre@dominio.com."
                    />
                  );
                if (key === 'dpi')
                  return <DpiField {...props} hint="Trece dígitos del DPI: #### ##### ####." />;
                if (key === 'nit')
                  return (
                    <NitField
                      {...props}
                      hint="NIT con dígito verificador según tu RTU, por ejemplo 1234567-9."
                    />
                  );
                if (key === 'direccion')
                  return (
                    <TextAreaField
                      {...props}
                      hint="Dirección completa de residencia: calle, zona y municipio."
                      maxLength={500}
                      placeholder="Calle, número, zona, municipio…"
                    />
                  );
                if (key === 'estadoCivil')
                  return (
                    <SelectField
                      {...props}
                      hint="Selecciona tu estado civil actual para revisión de RRHH."
                      opciones={['SOLTERO', 'CASADO', 'UNIDO', 'DIVORCIADO', 'VIUDO'].map(
                        (value) => ({ value, label: value }),
                      )}
                    />
                  );
                return (
                  <TextField
                    {...props}
                    hint={
                      key === 'contactoParentesco'
                        ? 'Relación con el contacto, por ejemplo madre o hermano.'
                        : 'Nombre completo como aparece en el documento de identidad.'
                    }
                    tipo={key === 'contactoParentesco' ? 'texto' : 'nombre'}
                    maxLength={
                      key === 'contactoNombre' ? 200 : key === 'contactoParentesco' ? 60 : 100
                    }
                    placeholder={
                      key === 'contactoParentesco' ? 'Madre, hermano…' : 'Nombre completo…'
                    }
                  />
                );
              }}
            />
          ))}
        </div>
        <FormErrorSummary
          mensajes={Object.values(f.formState.errors).map((e) => e?.message)}
          mensajeServidor={m.error?.message}
        />
        <Button
          icono={tipo === 'contacto' ? 'guardar' : 'correo'}
          type="submit"
          cargando={m.isPending}
          disabled={!f.formState.isDirty}
          motivoDeshabilitado="Modifica al menos un dato para continuar."
        >
          {tipo === 'contacto' ? 'Guardar contacto' : 'Solicitar actualización de datos críticos'}
        </Button>
      </form>
      <ConfirmModal
        abierto={confirmar}
        titulo={tipo === 'contacto' ? 'Guardar contacto' : 'Enviar solicitud de datos críticos'}
        descripcion={
          tipo === 'contacto'
            ? 'Se actualizarán tu contacto y contacto principal de emergencia. La operación quedará auditada.'
            : 'RRHH recibirá los valores actuales y propuestos. Tus datos se aplicarán únicamente después de la aprobación.'
        }
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => m.mutate()}
        cargando={m.isPending}
      />
    </Card>
  );
}
