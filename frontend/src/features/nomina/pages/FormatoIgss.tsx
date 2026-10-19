import { FormGrid } from '../../../components/forms/FormGrid';
import { useDraftValues } from '../../../hooks/useFormDraft';
import { FormDraftNotice } from '../../../components/forms/FormDraftNotice';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/nomina';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  TextField,
  NumberField,
  SelectField,
  EmailField,
  NitField,
  PhoneField,
  TextAreaField,
  FormErrorSummary,
} from '../../../components/forms';
import { ReferenciaNovedad } from '../../novedades/pages/CampoNovedad';
import { ErrorApi } from '../../../lib/http';
import { useToast } from '../../../components/ui/Toast';
type Registro = Record<string, string>;
interface Formato {
  version: string;
  patrono: string;
  pruebas: string;
  nombre: string;
  nit: string;
  direccion: string;
  correo: string;
  centros: (Registro & { id: string })[];
  tipos: Registro[];
  empleados: (Registro & { id: string })[];
}
export function FormatoIgss() {
  const d = useQuery({ queryKey: ['nomina', 'formato-igss'], queryFn: api.formato });
  if (d.isPending) return <Skeleton lineas={7} />;
  if (d.error) return <p role="alert">{d.error.message}</p>;
  return <Editor datos={d.data!} />;
}
function Editor({ datos }: { datos: Awaited<ReturnType<typeof api.formato>> }) {
  const cache = useQueryClient(),
    toast = useToast();
  const inicial = datos.formato as unknown as Formato | null;
  const { campo, draft } = useDraftValues<{
    f: Formato;
    seccion: 'centros' | 'tipos' | 'empleados';
    r: Registro;
    motivo: string;
  }>(
    'formato-igss',
    undefined,
    {
      f: inicial
        ? {
            ...inicial,
            centros: inicial.centros.map((c) => ({ ...c, id: String(c.id) })),
            empleados: inicial.empleados.map((e) => ({ ...e, id: String(e.id) })),
          }
        : {
            version: '2.2.0',
            patrono: '',
            pruebas: '1',
            nombre: datos.empresa?.nombre ?? '',
            nit: datos.empresa?.nit ?? '',
            direccion: '',
            correo: '',
            centros: [],
            tipos: [],
            empleados: [],
          },
      seccion: 'centros',
      r: {},
      motivo: '',
    },
    true,
    {
      alDescartar: () => {
        setConfirmar(false);
        setError('');
      },
    },
  );
  const [f, setF] = campo('f');
  const [seccion, setSeccion] = campo('seccion');
  const [r, setR] = campo('r');
  const [motivo, setMotivo] = campo('motivo');
  const [confirmar, setConfirmar] = useState(false),
    [error, setError] = useState('');
  useEffect(() => setConfirmar(false), [f, motivo]);
  const guardar = useMutation({
    mutationFn: () =>
      api.guardarFormato({
        formato: {
          ...f,
          centros: f.centros.map((c) => ({ ...c, id: Number(c.id) })),
          empleados: f.empleados.map((e) => ({ ...e, id: Number(e.id) })),
        },
        motivo,
        confirmado: true,
      }),
    onSuccess: () => {
      draft.limpiar();
      toast('Formato IGSS guardado. Ya puedes exportar meses cerrados.');
      setConfirmar(false);
      void cache.invalidateQueries({ queryKey: ['nomina', 'formato-igss'] });
    },
    onError: (e) => {
      setError(
        e instanceof ErrorApi && e.campos
          ? `${e.message} ${Object.values(e.campos).flat().join(' ')}`
          : e.message,
      );
      setConfirmar(false);
    },
  });
  const root = (
    key: keyof Pick<Formato, 'patrono' | 'nombre' | 'nit' | 'correo' | 'direccion'>,
    label: string,
    hint: string,
    numerico = false,
  ) => (
    <div key={key} className="contents">
      {numerico ? (
        <NumberField
          name={key}
          label={label}
          hint={hint}
          value={f[key]}
          onValueChange={(v) => {
            setF((p) => ({ ...p, [key]: v }));
            setConfirmar(false);
          }}
          required
        />
      ) : key === 'nit' ? (
        <NitField
          name={key}
          label={label}
          hint={hint}
          value={f[key]}
          onValueChange={(v) => setF((p) => ({ ...p, [key]: v }))}
          required
        />
      ) : key === 'correo' ? (
        <EmailField
          name={key}
          label={label}
          hint={hint}
          value={f[key]}
          onValueChange={(v) => setF((p) => ({ ...p, [key]: v }))}
          required
        />
      ) : (
        <TextField
          name={key}
          label={label}
          hint={hint}
          value={f[key]}
          maxLength={200}
          onValueChange={(v) => {
            setF((p) => ({ ...p, [key]: v.replace(/[|]/g, '') }));
            setConfirmar(false);
          }}
          required
        />
      )}
    </div>
  );
  const campos: Record<typeof seccion, [string, string, boolean][]> = {
    centros: [
      ['codigo', 'Código del centro IGSS', true],
      ['nombre', 'Nombre registrado', false],
      ['direccion', 'Dirección del centro', false],
      ['zona', 'Zona', true],
      ['telefono', 'Teléfono', false],
      ['fax', 'Fax', false],
      ['contacto', 'Contacto', false],
      ['correo', 'Correo del centro', false],
      ['departamento', 'Código de departamento', true],
      ['municipio', 'Código de municipio', true],
      ['actividad', 'Actividad económica (6 dígitos)', true],
    ],
    tipos: [
      ['codigo', 'Código de tipo de planilla', true],
      ['nombre', 'Nombre del tipo', false],
      ['departamento', 'Código de departamento', true],
      ['actividad', 'Actividad económica (6 dígitos)', true],
    ],
    empleados: [
      ['ocupacion', 'Código de ocupación', true],
      ['primerNombre', 'Primer nombre', false],
      ['otrosNombres', 'Segundo y demás nombres', false],
      ['primerApellido', 'Primer apellido', false],
      ['segundoApellido', 'Segundo apellido', false],
      ['apellidoCasada', 'Apellido de casada', false],
    ],
  };
  const opciones: Record<typeof seccion, [string, string, { value: string; label: string }[]][]> = {
    centros: [],
    tipos: [
      [
        'afiliado',
        'Cobertura IVS',
        [
          { value: 'C', label: 'Con IVS' },
          { value: 'S', label: 'Sin IVS' },
        ],
      ],
      [
        'tiempo',
        'Tiempo de contrato',
        [
          { value: 'TC', label: 'Tiempo completo' },
          { value: 'TP', label: 'Tiempo parcial' },
        ],
      ],
    ],
    empleados: [
      ['tipo', 'Tipo de planilla', f.tipos.map((t) => ({ value: t.codigo!, label: t.nombre! }))],
      [
        'condicion',
        'Condición laboral',
        [
          { value: 'P', label: 'Permanente' },
          { value: 'T', label: 'Temporal' },
        ],
      ],
      [
        'salario',
        'Forma de salario',
        [
          { value: '1', label: 'Salario base mensual' },
          { value: '2', label: 'Mensual + horas extra' },
          { value: '8', label: 'Mensual + comisiones' },
        ],
      ],
    ],
  };
  const agregar = () => {
    const ds = Object.fromEntries(campos[seccion].map(([k]) => [k, r[k] ?? '']));
    let nuevo: Registro = { ...ds, ...r };
    if (seccion === 'tipos') nuevo = { ...nuevo, periodo: 'M', clase: 'N' };
    const clave = seccion === 'tipos' ? 'codigo' : 'id';
    if (!nuevo[clave]) {
      setError('Selecciona el registro o indica su código antes de agregarlo.');
      return;
    }
    setF((p) => ({
      ...p,
      [seccion]: [...p[seccion].filter((v) => v[clave] !== nuevo[clave]), nuevo],
    }));
    setR({});
    setError('');
    setConfirmar(false);
  };
  return (
    <>
      <FormDraftNotice draft={draft} />
      <p className="campo-hint my-4">
        Usa los códigos y nombres inscritos ante IGSS. El archivo mensual consolida las dos
        quincenas cerradas. Guarda los centros, tipos y asignaciones reales antes de exportar.
      </p>
      <Card data-tour="igss-patrono">
        <h3>Datos patronales</h3>
        <FormGrid className="my-4">
          {root(
            'patrono',
            'Número patronal',
            'Número de registro patronal otorgado por IGSS.',
            true,
          )}
          {root('nombre', 'Nombre comercial', 'Nombre registrado de la empresa.')}
          {root('nit', 'NIT patronal', 'NIT de la empresa que presenta la planilla.')}
          {root('direccion', 'Dirección de la empresa', 'Dirección fiscal real de la empresa.')}
          {root('correo', 'Correo patronal', 'Correo de recepción de validaciones de IGSS.')}
          <SelectField
            name="pruebas"
            label="Destino de la declaración"
            hint="El IGSS distingue los archivos de prueba y producción."
            value={f.pruebas}
            onValueChange={(v) => setF((p) => ({ ...p, pruebas: v }))}
            required
            opciones={[
              { value: '1', label: 'Pruebas IGSS' },
              { value: '0', label: 'Producción IGSS' },
            ]}
          />
        </FormGrid>
      </Card>
      <div className="flex flex-wrap gap-2 my-4">
        {(['centros', 'tipos', 'empleados'] as const).map((v) => (
          <Button
            key={v}
            icono="editar"
            variante="secundario"
            onClick={() => {
              setSeccion(v);
              setR({});
            }}
          >
            {
              {
                centros: 'Centros de trabajo',
                tipos: 'Tipos de planilla',
                empleados: 'Asignación de empleados',
              }[v]
            }
          </Button>
        ))}
      </div>
      <FormGrid data-tour="igss-registros">
        {seccion === 'centros' && (
          <SelectField
            name="idCentro"
            label="Centro del sistema"
            hint="Vincula un centro real al código registrado en IGSS."
            value={r.id ?? ''}
            onValueChange={(v) =>
              setR((p) => ({
                ...p,
                id: v,
                nombre: datos.centros.find((c) => String(c.id) === v)?.nombre ?? '',
                direccion: datos.centros.find((c) => String(c.id) === v)?.direccion ?? '',
              }))
            }
            opciones={datos.centros.map((c) => ({ value: String(c.id), label: c.nombre }))}
          />
        )}
        {seccion === 'empleados' && (
          <div className="contents">
            <ReferenciaNovedad
              referencia="empleados"
              name="id"
              label="Empleado"
              hint="Los nombres deben coincidir con la afiliación IGSS; conserva apellidos compuestos."
              value={r.id ?? ''}
              onValueChange={(v) => setR((p) => ({ ...p, id: v }))}
            />
          </div>
        )}
        {campos[seccion].map(([k, label, numerico]) =>
          numerico ? (
            <NumberField
              key={k}
              name={k}
              label={label}
              hint="Código numérico inscrito ante IGSS."
              value={r[k] ?? ''}
              onValueChange={(v) => setR((p) => ({ ...p, [k]: v }))}
            />
          ) : k === 'correo' ? (
            <EmailField
              key={k}
              name={k}
              label={label}
              hint="Correo del centro registrado ante IGSS."
              value={r[k] ?? ''}
              onValueChange={(v) => setR((p) => ({ ...p, [k]: v }))}
            />
          ) : ['telefono', 'fax'].includes(k) ? (
            <PhoneField
              key={k}
              name={k}
              label={label}
              hint="Ocho dígitos sin código de país; vacío si no corresponde."
              value={r[k] ?? ''}
              onValueChange={(v) => setR((p) => ({ ...p, [k]: v.replace(/\s/g, '') }))}
            />
          ) : (
            <TextField
              key={k}
              name={k}
              label={label}
              hint="Dato registrado; deja vacío solo si no corresponde."
              maxLength={200}
              tipo={/Nombre|Apellido|nombre|apellido|contacto/.test(k) ? 'nombre' : 'texto'}
              value={r[k] ?? ''}
              onValueChange={(v) => setR((p) => ({ ...p, [k]: v.replace(/[|]/g, '') }))}
            />
          ),
        )}
        {opciones[seccion].map(([k, label, ops]) => (
          <SelectField
            key={k}
            name={k}
            label={label}
            hint="Clasificación inscrita en el registro patronal."
            value={r[k] ?? ''}
            onValueChange={(v) => setR((p) => ({ ...p, [k]: v }))}
            opciones={ops}
          />
        ))}
      </FormGrid>
      <Button icono="guardar" variante="secundario" onClick={agregar}>
        Agregar o actualizar registro
      </Button>
      <div className="table-scroll my-4" data-tour="igss-tabla">
        <table>
          <caption>Registros del formato: {seccion}</caption>
          <thead>
            <tr>
              <th>Identificador</th>
              <th>Nombre / asignación</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {f[seccion].map((v, i) => (
              <tr key={i}>
                <td>{v.id ?? v.codigo}</td>
                <td>{v.nombre ?? `${v.primerNombre} ${v.primerApellido} · Tipo ${v.tipo}`}</td>
                <td>
                  <div className="flex gap-2">
                    <Button icono="editar" variante="texto" onClick={() => setR({ ...v })}>
                      Editar
                    </Button>
                    <Button
                      icono="eliminar"
                      variante="texto"
                      onClick={() => {
                        setF((p) => ({ ...p, [seccion]: p[seccion].filter((_, j) => i !== j) }));
                        setConfirmar(false);
                      }}
                    >
                      Quitar del formato
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormGrid>
        <TextAreaField
          name="motivo"
          label="Motivo de configuración"
          hint="Explica el origen o cambio de los códigos; mínimo 10 caracteres."
          value={motivo}
          maxLength={500}
          onValueChange={setMotivo}
          required
        />
      </FormGrid>
      <FormErrorSummary mensajes={[error]} />
      {confirmar && (
        <p className="banda-informativa my-4">
          Confirma número patronal {f.patrono}, destino{' '}
          {f.pruebas === '1' ? 'pruebas' : 'producción'}, {f.centros.length} centros,{' '}
          {f.tipos.length} tipos y {f.empleados.length} empleados.
        </p>
      )}
      <Button
        icono="guardar"
        cargando={guardar.isPending}
        disabled={motivo.trim().length < 10}
        motivoDeshabilitado="Escribe un motivo de al menos diez caracteres para revisar la configuración."
        data-tour="igss-guardar"
        onClick={() => (confirmar ? guardar.mutate() : setConfirmar(true))}
      >
        {confirmar ? 'Confirmar configuración' : 'Revisar configuración'}
      </Button>
    </>
  );
}
