import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { DefaultValues, FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form';
import { useSession } from '../app/session';
import {
  claveBorrador,
  claveSesionBorradores,
  eventoBorradores,
  leerBorrador,
  sanearBorrador,
  sesionPermiteBorrador,
} from '../lib/formDraft';
import type { Borrador } from '../lib/formDraft';

export interface FormDraft {
  pendiente: Borrador | null;
  guardado: number | null;
  error: boolean;
  continuar: () => void;
  descartar: () => void;
  limpiar: () => void;
}
interface Opciones<T extends FieldValues> {
  form: UseFormReturn<T>;
  version: number;
  enabled?: boolean | undefined;
  paso?: string | number | undefined;
  restaurarPaso?: ((paso: string | number) => void) | undefined;
  alDescartar?: (() => void) | undefined;
}

export function useFormDraft<T extends FieldValues>(
  formKey: string,
  recordId: string | number | undefined,
  opciones: Opciones<T>,
): FormDraft {
  const { usuario } = useSession();
  const idUsuario = usuario?.idUsuario;
  const { form, version, enabled = true } = opciones;
  const clave = usuario ? claveBorrador(usuario.idUsuario, formKey, recordId) : null;
  const actual = useRef(opciones);
  actual.current = opciones;
  const [estado, setEstado] = useState<Pick<FormDraft, 'pendiente' | 'guardado' | 'error'>>({
    pendiente: null,
    guardado: null,
    error: false,
  });
  const acciones = useRef({
    continuar: () => {},
    descartar: () => {},
    limpiar: () => {},
    cambioPaso: () => {},
  });
  useEffect(() => {
    setEstado({ pendiente: null, guardado: null, error: false });
    if (!clave || !idUsuario || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let bloqueado = false;
    let aplicando = false;
    let pendiente: Borrador | null = null;
    let cambios: Borrador | null = null;
    let iniciales = form.getValues();
    let pasoInicial = actual.current.paso;
    const capturar = (): Borrador => ({
      version,
      guardado: Date.now(),
      valores: sanearBorrador(form.getValues()) as Record<string, unknown>,
      paso: actual.current.paso,
    });
    const firma = (d: Borrador) => JSON.stringify([d.valores, d.paso]);
    let ultimo = firma(capturar());
    const cancelar = () => {
      clearTimeout(timer);
      cambios = null;
    };
    try {
      pendiente = leerBorrador(clave, version);
      setEstado({ pendiente, guardado: pendiente?.guardado ?? null, error: false });
    } catch {
      setEstado((s) => ({ ...s, error: true }));
    }
    const guardar = () => {
      clearTimeout(timer);
      if (!cambios || bloqueado || pendiente) return;
      try {
        if (!sesionPermiteBorrador(idUsuario)) {
          cancelar();
          bloqueado = true;
          return;
        }
        const d = { ...cambios, guardado: Date.now() };
        localStorage.setItem(clave, JSON.stringify(d));
        ultimo = firma(d);
        cambios = null;
        setEstado({ pendiente: null, guardado: d.guardado, error: false });
      } catch {
        setEstado((s) => ({ ...s, error: true }));
      }
    };
    const programar = () => {
      if (aplicando || bloqueado || pendiente) return;
      const d = capturar();
      if (firma(d) === ultimo) {
        cancelar();
        return;
      }
      cambios = d;
      clearTimeout(timer);
      timer = setTimeout(guardar, 500);
      setEstado((s) => ({ ...s, guardado: null }));
    };
    const limpiar = () => {
      cancelar();
      pendiente = null;
      ultimo = firma(capturar());
      aplicando = true;
      queueMicrotask(() => {
        iniciales = form.getValues();
        pasoInicial = actual.current.paso;
        ultimo = firma(capturar());
        aplicando = false;
      });
      try {
        localStorage.removeItem(clave);
        setEstado({ pendiente: null, guardado: null, error: false });
      } catch {
        setEstado({ pendiente: null, guardado: null, error: true });
      }
    };
    acciones.current = {
      limpiar,
      continuar: () => {
        if (!pendiente || bloqueado) return;
        const d = pendiente;
        pendiente = null;
        aplicando = true;
        // Conserva los valores excluidos y los campos nuevos; RHF y el servidor revalidan al enviar.
        form.reset({ ...form.getValues(), ...d.valores } as T, { keepDefaultValues: true });
        if (d.paso !== undefined) actual.current.restaurarPaso?.(d.paso);
        ultimo = firma(d);
        aplicando = false;
        setEstado({ pendiente: null, guardado: d.guardado, error: false });
      },
      descartar: () => {
        aplicando = true;
        form.reset(iniciales);
        if (pasoInicial !== undefined) actual.current.restaurarPaso?.(pasoInicial);
        actual.current.alDescartar?.();
        aplicando = false;
        limpiar();
      },
      cambioPaso: programar,
    };
    const subscription = form.watch((_datos, info) => {
      // Un reset de datos de la API no es una edición del usuario.
      if (!info.name && !aplicando) {
        iniciales = form.getValues();
        pasoInicial = actual.current.paso;
        ultimo = firma(capturar());
        cancelar();
        return;
      }
      programar();
    });
    const ocultar = () => {
      if (document.visibilityState === 'hidden') guardar();
    };
    const sesion = (e: Event) => {
      if ((e as CustomEvent<{ usuario: number | null }>).detail.usuario !== idUsuario) {
        bloqueado = true;
        cancelar();
        setEstado({ pendiente: null, guardado: null, error: false });
      }
    };
    const almacenamiento = (e: StorageEvent) => {
      if (e.key === claveSesionBorradores || e.key === null) {
        try {
          if (!sesionPermiteBorrador(idUsuario)) {
            bloqueado = true;
            cancelar();
          }
        } catch {
          cancelar();
        }
      }
    };
    window.addEventListener('pagehide', guardar);
    document.addEventListener('visibilitychange', ocultar);
    window.addEventListener(eventoBorradores, sesion);
    window.addEventListener('storage', almacenamiento);
    return () => {
      guardar();
      cancelar();
      subscription.unsubscribe();
      window.removeEventListener('pagehide', guardar);
      document.removeEventListener('visibilitychange', ocultar);
      window.removeEventListener(eventoBorradores, sesion);
      window.removeEventListener('storage', almacenamiento);
      acciones.current = {
        continuar: () => {},
        descartar: () => {},
        limpiar: () => {},
        cambioPaso: () => {},
      };
    };
  }, [clave, idUsuario, form, version, enabled]);
  useEffect(() => {
    acciones.current.cambioPaso();
  }, [opciones.paso]);
  const continuar = useCallback(() => acciones.current.continuar(), []);
  const descartar = useCallback(() => acciones.current.descartar(), []);
  const limpiar = useCallback(() => acciones.current.limpiar(), []);
  return { ...estado, continuar, descartar, limpiar };
}

// Adaptador de los editores controlados existentes: sus valores también viven en React Hook Form.
export function useDraftValues<T extends FieldValues>(
  formKey: string,
  recordId: string | number | undefined,
  iniciales: T,
  enabled = true,
  opciones: { version?: number; alDescartar?: () => void } = {},
) {
  const form = useForm<T>({ defaultValues: iniciales as DefaultValues<T> });
  const identidad = `${formKey}:${recordId ?? 'nuevo'}`;
  const anterior = useRef(identidad);
  useEffect(() => {
    if (anterior.current !== identidad) {
      anterior.current = identidad;
      form.reset(iniciales);
    }
  }, [identidad, form, iniciales]);
  const draft = useFormDraft(formKey, recordId, {
    form,
    version: opciones.version ?? 1,
    enabled,
    alDescartar: opciones.alDescartar,
  });
  const valores = form.watch();
  const campo = <K extends keyof T & string>(key: K) =>
    [
      valores[key],
      (valor: T[K] | ((anterior: T[K]) => T[K])) => {
        const nuevo =
          typeof valor === 'function'
            ? (valor as (anterior: T[K]) => T[K])(form.getValues()[key])
            : valor;
        form.setValue(key as unknown as Path<T>, nuevo as PathValue<T, Path<T>>, {
          shouldDirty: true,
        });
      },
    ] as const;
  return { valores, campo, draft };
}
