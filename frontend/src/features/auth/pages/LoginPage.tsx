import { FormErrorSummary } from '../../../components/forms/FormErrorSummary';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import type { z } from 'zod';
import { AuthFrame } from './AuthFrame';
import { TextField } from '../../../components/forms/TextField';
import { Button } from '../../../components/ui/Button';
import { usePageHelp } from '../../../components/help/HelpProvider';
import { ayudaLogin } from '../help/pasos';
import { loginSchema } from '../api/schemas';
import { destinoRol, iniciarSesion } from '../api/auth';
import { useSession } from '../../../app/session';
import { mapearErrores } from '../../../lib/http';
type Datos = z.infer<typeof loginSchema>;
export function LoginPage() {
  const sesion = useSession();
  usePageHelp(ayudaLogin);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Datos>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { usuario: '', contrasena: '' },
  });
  const login = useMutation({
    mutationFn: iniciarSesion,
    onSuccess: sesion.establecer,
    onError: (e) => mapearErrores(e, setError, ['usuario', 'contrasena']),
  });
  if (sesion.usuario)
    return (
      <Navigate
        to={
          sesion.usuario.cambioObligatorio ? '/cambiar-contrasena' : destinoRol(sesion.usuario.rol)
        }
        replace
      />
    );
  return (
    <AuthFrame>
      <h2>Iniciar Sesión</h2>
      <p className="auth-intro">Accede con el usuario asignado a tu cuenta.</p>
      {sesion.expirada && (
        <p role="alert" className="alerta">
          Tu sesión expiró. Inicia sesión nuevamente para continuar.
        </p>
      )}
      <form
        noValidate
        onSubmit={handleSubmit((d) => {
          if (!login.isPending) login.mutate(d);
        })}
        className="formulario-login"
      >
        <div data-tour="credenciales">
          <Controller
            control={control}
            name="usuario"
            render={({ field }) => (
              <TextField
                name={field.name}
                inputRef={field.ref}
                label="Usuario"
                hint="Usuario entregado por el administrador, con formato nombre.apellido."
                tipo="usuario"
                autoComplete="username"
                placeholder="nombre.apellido"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.usuario?.message}
                required
                ancho="ancho"
                maxLength={80}
                disabled={login.isPending}
              />
            )}
          />
        </div>
        <div data-tour="clave-login">
          <Controller
            control={control}
            name="contrasena"
            render={({ field }) => (
              <TextField
                name={field.name}
                inputRef={field.ref}
                label="Contraseña"
                hint="Respeta mayúsculas y símbolos. Puedes usar el ojo para revisar lo escrito."
                tipo="contrasena"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.contrasena?.message}
                required
                ancho="ancho"
                maxLength={128}
                disabled={login.isPending}
              />
            )}
          />
        </div>
        <FormErrorSummary
          mensajes={Object.values(errors).map((e) => e.message)}
          mensajeServidor={login.error?.message}
        />
        <Button
          data-tour="entrar"
          icono="entrar"
          type="submit"
          cargando={login.isPending}
          className="w-full"
        >
          {login.isPending ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </Button>
      </form>
      <p className="auth-soporte" data-tour="soporte">
        ¿Olvidaste tu contraseña o necesitas una cuenta?
        <br />
        <strong>Contacta al administrador.</strong>
      </p>
    </AuthFrame>
  );
}
