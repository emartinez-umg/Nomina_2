import { StrictMode, useState } from 'react';
import { act, renderHook, render, screen, fireEvent, within } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftValues, useFormDraft } from './useFormDraft';
import { FormDraftNotice } from '../components/forms/FormDraftNotice';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import {
  activarBorradoresUsuario,
  claveBorrador,
  claveSesionBorradores,
  limpiarBorradoresSesion,
  leerBorrador,
} from '../lib/formDraft';
const sesion = vi.hoisted(() => ({ usuario: { idUsuario: 7 } as { idUsuario: number } | null }));
vi.mock('../app/session', () => ({ useSession: () => sesion }));
const clave = claveBorrador(7, 'expediente');
function preparar(version = 1, registro?: number) {
  return renderHook(
    ({ v, id }: { v: number; id: number | undefined }) => {
      const form = useForm({ defaultValues: { nombre: 'Inicial', contrasena: '', archivo: null } });
      const [paso, setPaso] = useState<string | number>('personal');
      const draft = useFormDraft('expediente', id, {
        form,
        version: v,
        paso,
        restaurarPaso: setPaso,
      });
      return { form, draft, paso, setPaso };
    },
    { initialProps: { v: version, id: registro } },
  );
}
const tick = (ms = 500) => act(() => vi.advanceTimersByTime(ms));
const almacenado = (valores = { nombre: 'Borrador' }, version = 1) => ({
  version,
  guardado: Date.now() - 180000,
  valores,
  paso: 'banco',
});
beforeEach(() => {
  localStorage.clear();
  sesion.usuario = { idUsuario: 7 };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useFormDraft con React Hook Form', () => {
  it('cancelar después de borrar todo sale directamente y elimina una versión anterior del borrador', () => {
    const { result, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'Edición', { shouldDirty: true }));
    tick();
    act(() => result.current.form.setValue('nombre', 'Inicial', { shouldDirty: true }));
    const salir = vi.fn();
    act(() => result.current.draft.cancelar(salir));
    expect(salir).toHaveBeenCalledTimes(1);
    unmount();
    tick();
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it.each(['conservar', 'descartar', 'sin datos'] as const)(
    'Cancelar ofrece una decisión y respeta %s, incluso antes del debounce',
    (accion) => {
      const salir = vi.fn();
      function Editor() {
        const form = useForm({ defaultValues: { nombre: '' } });
        const draft = useFormDraft('expediente', undefined, { form, version: 1 });
        return (
          <Modal abierto titulo="Editar" onCerrar={salir}>
            <FormDraftNotice draft={draft} />
            <input aria-label="Nombre" {...form.register('nombre')} />
            <Button cancelarFormulario icono="cancelar" onClick={salir}>
              Cancelar
            </Button>
          </Modal>
        );
      }
      const primero = render(<Editor />);
      if (accion !== 'sin datos')
        fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Edición' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      if (accion !== 'sin datos') {
        expect(salir).not.toHaveBeenCalled();
        fireEvent.click(
          screen.getByRole('button', {
            name: accion === 'conservar' ? 'Conservar borrador y salir' : 'Descartar y salir',
          }),
        );
      }
      expect(salir).toHaveBeenCalledTimes(1);
      primero.unmount();
      tick();
      const segundo = preparar();
      expect(!!segundo.result.current.draft.pendiente).toBe(accion === 'conservar');
      if (accion === 'conservar') expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Edición');
    },
  );
  it('descartar cancela el debounce y bloquea cambios automáticos tardíos hasta una nueva edición', async () => {
    const { result, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'Pendiente', { shouldDirty: true }));
    await act(async () => result.current.draft.descartar());
    act(() => result.current.form.setValue('nombre', 'Valor derivado', { shouldDirty: false }));
    act(() => result.current.setPaso('banco'));
    tick();
    unmount();
    expect(localStorage.getItem(clave)).toBeNull();
    const reabierto = preparar();
    expect(reabierto.result.current.draft.pendiente).toBeNull();
  });
  it('no crea borradores por montar ni al resetear datos de la API', () => {
    const { result } = preparar();
    act(() => result.current.form.reset({ nombre: 'Servidor', contrasena: '', archivo: null }));
    tick();
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('guarda la última edición tras 500 ms con clave y versión, sin esperar un render', () => {
    const { result } = preparar();
    act(() => result.current.form.setValue('nombre', 'Uno'));
    tick(400);
    act(() => result.current.form.setValue('nombre', 'Dos'));
    tick(499);
    expect(localStorage.getItem(clave)).toBeNull();
    tick(1);
    expect(leerBorrador(clave, 1)?.valores).toEqual({ nombre: 'Dos' });
    expect(result.current.draft.guardado).toEqual(Date.now());
  });
  it('no guarda cambios hechos únicamente en contraseñas o archivos', () => {
    const { result } = preparar();
    act(() => result.current.form.setValue('contrasena', 'No persistir'));
    tick();
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('espera Continuar y no sobrescribe el borrador pendiente', () => {
    localStorage.setItem(clave, JSON.stringify(almacenado()));
    const { result } = preparar();
    expect(result.current.form.getValues('nombre')).toBe('Inicial');
    act(() => result.current.form.setValue('nombre', 'Edición antes de decidir'));
    tick();
    expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Borrador');
    act(() => result.current.draft.continuar());
    expect(result.current.form.getValues('nombre')).toBe('Borrador');
    expect(result.current.paso).toBe('banco');
    expect(result.current.draft.pendiente).toBeNull();
    expect(result.current.form.formState.isDirty).toBe(true);
  });
  it('conserva la sección aunque el usuario solo cambie de paso', () => {
    const { result } = preparar();
    act(() => result.current.setPaso('emergencia'));
    tick();
    expect(leerBorrador(clave, 1)?.paso).toBe('emergencia');
  });
  it('retoma el formulario al desmontar y volver, incluso antes del debounce', () => {
    const primero = preparar();
    act(() => primero.result.current.form.setValue('nombre', 'Última tecla'));
    primero.unmount();
    const segundo = preparar();
    act(() => segundo.result.current.draft.continuar());
    expect(segundo.result.current.form.getValues('nombre')).toBe('Última tecla');
  });
  it.each(['pagehide', 'visibilitychange'])('vacía el debounce al salir mediante %s', (evento) => {
    const { result } = preparar();
    act(() => result.current.form.setValue('nombre', 'Al cerrar pestaña'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => (evento === 'pagehide' ? window : document).dispatchEvent(new Event(evento)));
    expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Al cerrar pestaña');
  });
  it('descarta, restablece valores iniciales y permite empezar otro borrador', async () => {
    localStorage.setItem(clave, JSON.stringify(almacenado()));
    const { result } = preparar();
    await act(async () => result.current.draft.descartar());
    expect(result.current.form.getValues('nombre')).toBe('Inicial');
    tick();
    expect(localStorage.getItem(clave)).toBeNull();
    act(() => result.current.form.setValue('nombre', 'Nuevo borrador', { shouldDirty: true }));
    tick();
    expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Nuevo borrador');
  });
  it('limpiar tras guardar cancela timers y no recrea el borrador al resetear campos', async () => {
    const { result, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'A guardar'));
    await act(async () => {
      result.current.draft.limpiar();
      result.current.form.setValue('nombre', '');
    });
    tick();
    unmount();
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('un guardado fallido conserva datos y el borrador', () => {
    const { result, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'Pendiente'));
    tick();
    act(() => result.current.form.setError('nombre', { message: 'Ya existe' }));
    unmount();
    expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Pendiente');
  });
  it('descartar una edición posterior a guardar vuelve al último valor confirmado', async () => {
    const { result } = preparar();
    act(() => result.current.form.setValue('nombre', 'Guardado en el servidor'));
    await act(async () => result.current.draft.limpiar());
    act(() => result.current.form.setValue('nombre', 'Nueva edición', { shouldDirty: true }));
    tick();
    await act(async () => result.current.draft.descartar());
    expect(result.current.form.getValues('nombre')).toBe('Guardado en el servidor');
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('limpia todos los borradores al cerrar sesión sin que timers o desmontajes los recreen', () => {
    const { result, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'Pendiente'));
    localStorage.setItem(claveBorrador(7, 'otro'), JSON.stringify(almacenado()));
    act(limpiarBorradoresSesion);
    tick();
    unmount();
    expect(localStorage.getItem(clave)).toBeNull();
    expect(localStorage.getItem(claveBorrador(7, 'otro'))).toBeNull();
  });
  it('cambio de usuario purga los ajenos y cancela escrituras del usuario anterior', () => {
    const { result, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'Anterior'));
    const propia = claveBorrador(8, 'expediente');
    localStorage.setItem(propia, JSON.stringify(almacenado({ nombre: 'Usuario nuevo' })));
    act(() => activarBorradoresUsuario(8));
    tick();
    unmount();
    expect(localStorage.getItem(clave)).toBeNull();
    sesion.usuario = { idUsuario: 8 };
    const nuevo = preparar();
    act(() => nuevo.result.current.draft.continuar());
    expect(nuevo.result.current.form.getValues('nombre')).toBe('Usuario nuevo');
  });
  it('expiración por inactividad conserva el borrador para la misma cuenta', () => {
    const { result, rerender, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'Sesión vencida'));
    sesion.usuario = null;
    rerender({ v: 1, id: undefined });
    unmount();
    expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Sesión vencida');
    sesion.usuario = { idUsuario: 7 };
    activarBorradoresUsuario(7);
    const nuevo = preparar();
    expect(nuevo.result.current.draft.pendiente?.valores.nombre).toBe('Sesión vencida');
  });
  it('logout desde otra pestaña impide volver a escribir', () => {
    const { result, unmount } = preparar();
    act(() => result.current.form.setValue('nombre', 'Anterior'));
    localStorage.setItem(claveSesionBorradores, JSON.stringify({ usuario: null }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: claveSesionBorradores })));
    tick();
    unmount();
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('descarta silenciosamente una versión de esquema distinta', () => {
    localStorage.setItem(clave, JSON.stringify(almacenado({ nombre: 'Obsoleto' }, 2)));
    const { result } = preparar(1);
    expect(result.current.draft.pendiente).toBeNull();
    expect(result.current.form.getValues('nombre')).toBe('Inicial');
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('aísla registros nuevos, ediciones y otros formularios', () => {
    const { result } = preparar(1, 21);
    act(() => result.current.form.setValue('nombre', 'Registro 21'));
    tick();
    expect(localStorage.getItem(clave)).toBeNull();
    expect(localStorage.getItem(claveBorrador(7, 'expediente', 22))).toBeNull();
    expect(leerBorrador(claveBorrador(7, 'expediente', 21), 1)?.valores.nombre).toBe('Registro 21');
  });
  it.each(['getItem', 'setItem'])(
    'tolera almacenamiento bloqueado o lleno en %s y puede recuperarse',
    (metodo) => {
      const bloqueo = vi.spyOn(Storage.prototype, metodo).mockImplementation(() => {
        throw new DOMException('Bloqueado', 'QuotaExceededError');
      });
      const { result } = preparar();
      act(() => result.current.form.setValue('nombre', 'Sin almacenamiento'));
      tick();
      expect(result.current.form.getValues('nombre')).toBe('Sin almacenamiento');
      expect(result.current.draft.error).toBe(true);
      bloqueo.mockRestore();
      act(() => result.current.form.setValue('nombre', 'Recuperado'));
      tick();
      expect(result.current.draft.error).toBe(false);
      expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Recuperado');
    },
  );
  it('funciona con el doble montaje de StrictMode', () => {
    const { result, unmount } = renderHook(
      () => {
        const form = useForm({ defaultValues: { nombre: '' } });
        return { form, draft: useFormDraft('expediente', undefined, { form, version: 1 }) };
      },
      { wrapper: StrictMode },
    );
    act(() => result.current.form.setValue('nombre', 'Estricto'));
    tick();
    unmount();
    expect(leerBorrador(clave, 1)?.valores.nombre).toBe('Estricto');
  });
  it('el adaptador conserva objetos, arreglos, campos parciales y sección; no mezcla registros', () => {
    const primero = renderHook(
      ({ id }) =>
        useDraftValues('igss', id, {
          f: { centros: [] as { id: string }[] },
          seccion: 'centros',
          parcial: '',
        }),
      { initialProps: { id: 1 } },
    );
    act(() => {
      primero.result.current.campo('f')[1]({ centros: [{ id: '21' }] });
      primero.result.current.campo('seccion')[1]('empleados');
      primero.result.current.campo('parcial')[1]('sin agregar');
    });
    primero.rerender({ id: 2 });
    expect(primero.result.current.valores.seccion).toBe('centros');
    expect(primero.result.current.valores.parcial).toBe('');
    primero.rerender({ id: 1 });
    act(() => primero.result.current.draft.continuar());
    expect(primero.result.current.valores.f.centros).toEqual([{ id: '21' }]);
    expect(primero.result.current.valores.seccion).toBe('empleados');
    expect(primero.result.current.valores.parcial).toBe('sin agregar');
  });
});

describe('Aviso accesible de borradores', () => {
  it('Continuar restaura; descartar exige confirmación y Cancelar conserva el borrador', () => {
    localStorage.setItem(clave, JSON.stringify(almacenado()));
    function Formulario() {
      const form = useForm({ defaultValues: { nombre: 'Inicial' } });
      const draft = useFormDraft('expediente', undefined, { form, version: 1 });
      return (
        <>
          <FormDraftNotice draft={draft} />
          <input aria-label="Nombre" {...form.register('nombre')} />
        </>
      );
    }
    render(<Formulario />);
    expect(screen.getByText(/guardado hace 3 minutos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(localStorage.getItem(clave)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Borrador');
    expect(screen.getByText('Borrador guardado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Inicial');
    expect(localStorage.getItem(clave)).toBeNull();
  });
});
