import type { DefinicionAyuda } from '../../../components/help/HelpProvider';
export const ayudaLogin: DefinicionAyuda = {
  id: 'login',
  pasos: [
    {
      elemento: 'marca',
      titulo: 'Bienvenido a Nómina',
      descripcion:
        'Este es el acceso privado al módulo de nómina. Recursos Humanos o el administrador te entrega un usuario y una contraseña temporal. No necesitas crear una cuenta.',
    },
    {
      elemento: 'credenciales',
      titulo: 'Usuario asignado',
      descripcion:
        'Escribe el usuario con formato nombre.apellido. El sistema normaliza las letras a minúsculas. Aquí se usa tu usuario, aunque el diseño original muestre correo electrónico. No compartas tus credenciales.',
    },
    {
      elemento: 'clave-login',
      titulo: 'Contraseña y visibilidad',
      descripcion:
        'Ingresa tu contraseña respetando mayúsculas y símbolos. El botón del ojo permite revisarla antes de enviar. Si es temporal, al entrar tendrás que elegir una nueva antes de acceder a los módulos.',
    },
    {
      elemento: 'entrar',
      titulo: 'Iniciar sesión',
      descripcion:
        'El sistema renueva el token de acceso previo, comprueba las credenciales y abre la página de tu rol sin avisos. Si llegaste desde una sección protegida sin sesión, se te pide entrar; una sesión vencida se explica por separado. Evita repetir intentos: cinco fallos bloquean la cuenta durante 15 minutos. Si aparece un error de conexión, espera y vuelve a intentar.',
    },
    {
      elemento: 'soporte',
      titulo: 'Ayuda con tu cuenta',
      descripcion:
        'Si olvidaste tu contraseña, solicita al administrador un restablecimiento. No hay registro público ni acceso con Google. Tu sesión vence por inactividad; cuando ocurra, inicia sesión nuevamente.',
    },
  ],
};
export const ayudaCambio: DefinicionAyuda = {
  id: 'cambiar-contrasena',
  pasos: [
    {
      elemento: 'cambio',
      titulo: 'Protege tu cuenta',
      descripcion:
        'Antes de continuar reemplaza la contraseña temporal. Ninguna sección de nómina queda disponible mientras exista este requisito, incluso si escribes una ruta directamente.',
    },
    {
      elemento: 'actual',
      titulo: 'Contraseña actual',
      descripcion:
        'Escribe la contraseña con la que acabas de entrar. El servidor comprueba que corresponda a tu cuenta antes de guardar el cambio.',
    },
    {
      elemento: 'nueva',
      titulo: 'Elige una contraseña segura',
      descripcion:
        'Usa entre 10 y 128 caracteres, incluyendo mayúsculas, minúsculas, números y un símbolo. Debe ser distinta de la contraseña actual. Evita tu nombre o información fácil de adivinar.',
    },
    {
      elemento: 'confirmacion',
      titulo: 'Confirma y guarda',
      descripcion:
        'Repite exactamente la contraseña nueva. Los errores se muestran junto al campo. Al guardar se cierran tus otras sesiones y se abre una sesión nueva en este navegador.',
    },
  ],
};
