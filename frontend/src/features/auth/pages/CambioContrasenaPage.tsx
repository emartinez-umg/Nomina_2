import { FormErrorSummary } from '../../../components/forms/FormErrorSummary';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import type { z } from 'zod';
import { AuthFrame } from './AuthFrame';
import { TextField } from '../../../components/forms/TextField';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaCambio } from '../help/pasos';
import { cambioSchema } from '../api/schemas';
import { cambiarContrasena, cerrarSesion, destinoRol } from '../api/auth';
import { useSession } from '../../../app/session';
import { mapearErrores } from '../../../lib/http';
type Datos = z.infer<typeof cambioSchema>;
const campos = [
  {
    name: 'contrasenaActual',
    label: 'Contraseña actual',
    hint: 'Ingresa la contraseña temporal o actual con la que iniciaste sesión.',
    tour: 'actual',
    autoComplete: 'current-password',
  },
  {
    name: 'contrasenaNueva',
    label: 'Nueva contraseña',
    hint: 'Entre 10 y 128 caracteres con mayúscula, minúscula, número y símbolo.',
    tour: 'nueva',
    autoComplete: 'new-password',
  },
  {
    name: 'confirmacion',
    label: 'Confirmar nueva contraseña',
    hint: 'Repite exactamente la contraseña nueva para evitar errores.',
    tour: 'confirmacion',
    autoComplete: 'new-password',
  },
] as const;
export function CambioContrasenaPage() {
  const sesion = useSession();
  const toast = useToast();
  usePageHelp(ayudaCambio, sesion.usuario?.rol);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Datos>({
    resolver: zodResolver(cambioSchema),
    mode: 'onBlur',
    defaultValues: { contrasenaActual: '', contrasenaNueva: '', confirmacion: '' },
  });
  const cambio = useMutation({
    mutationFn: (d: Datos) =>
      cambiarContrasena({
        contrasenaActual: d.contrasenaActual,
        contrasenaNueva: d.contrasenaNueva,
      }),
    onSuccess: (u) => {
      sesion.establecer(u);
      toast('Contraseña actualizada. Ya puedes continuar.');
    },
    onError: (e) => mapearErrores(e, setError, ['contrasenaActual', 'contrasenaNueva']),
  });
  const logout = useMutation({
    mutationFn: cerrarSesion,
    onSuccess: () => sesion.establecer(null),
  });
  if (!sesion.usuario) return <Navigate to="/login" replace />;
  if (!sesion.usuario.cambioObligatorio)
    return <Navigate to={destinoRol(sesion.usuario.rol)} replace />;
  return (
    <AuthFrame>
      <div data-tour="cambio">
        <h2>Cambia tu contraseña</h2>
        <p className="auth-intro">
          Por seguridad, debes actualizar tu contraseña antes de continuar.
        </p>
      </div>
      <form
        noValidate
        onSubmit={handleSubmit((d) => {
          if (!cambio.isPending) cambio.mutate(d);
        })}
        className="formulario-login"
      >
        {campos.map((c) => (
          <div key={c.name} data-tour={c.tour}>
            <Controller
              control={control}
              name={c.name}
              render={({ field }) => (
                <TextField
                  {...c}
                  name={field.name}
                  inputRef={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors[c.name]?.message}
                  tipo="contrasena"
                  maxLength={128}
                  required
                  ancho="ancho"
                  disabled={cambio.isPending || logout.isPending}
                />
              )}
            />
          </div>
        ))}
        <FormErrorSummary
          mensajes={Object.values(errors).map((e) => e.message)}
          mensajeServidor={cambio.error?.message}
        />
        <Button
          type="submit"
          icono="guardar"
          cargando={cambio.isPending}
          disabled={logout.isPending}
        >
          Guardar contraseña
        </Button>
        <Button
          icono="salir"
          variante="texto"
          cargando={logout.isPending}
          disabled={cambio.isPending}
          onClick={() => logout.mutate()}
        >
          Cerrar sesión
        </Button>
        {logout.error && (
          <p role="alert" className="campo-error">
            {logout.error.message}
          </p>
        )}
      </form>
    </AuthFrame>
  );
}
