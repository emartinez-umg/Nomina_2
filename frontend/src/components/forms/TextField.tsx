import { useState } from 'react';
import { InputField } from './Field';
import type { CampoProps } from './Field';
import { limpiarTexto, limpiarNombre, limpiarUsuario } from '../../lib/validadores';
import { Button } from '../ui/Button';
export function TextField({
  tipo = 'texto',
  maxLength = 100,
  autoComplete,
  ...props
}: CampoProps & {
  tipo?: 'texto' | 'nombre' | 'usuario' | 'contrasena';
  maxLength?: number;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <InputField
      {...props}
      maxLength={maxLength}
      autoComplete={autoComplete ?? 'off'}
      sanitizar={
        tipo === 'nombre'
          ? limpiarNombre
          : tipo === 'usuario'
            ? limpiarUsuario
            : tipo === 'contrasena'
              ? (v) => v
              : limpiarTexto
      }
      pattern={
        tipo === 'usuario'
          ? '[a-z][a-z0-9.]{2,79}'
          : tipo === 'nombre'
            ? "[\\p{L}\\p{M} '\\-]+"
            : '.*'
      }
      type={tipo === 'contrasena' && !visible ? 'password' : 'text'}
      sufijo={
        tipo === 'contrasena' ? (
          <Button
            icono={visible ? 'ocultar' : 'ver'}
            soloIcono
            variante="texto"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          />
        ) : undefined
      }
    />
  );
}
