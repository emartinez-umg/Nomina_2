export class ErrorNegocio extends Error {
  constructor(
    mensaje: string,
    public readonly estado = 422,
    public readonly codigo = 'REGLA_NEGOCIO',
    public readonly campos?: Record<string, string[]>,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

export class ErrorValidacion extends ErrorNegocio {
  constructor(campos: Record<string, string[]>) {
    super('Revisa los datos enviados e intenta nuevamente.', 400, 'VALIDACION', campos);
  }
}

export class ErrorNoAutorizado extends ErrorNegocio {
  constructor() {
    super('Inicia sesión para continuar.', 401, 'NO_AUTORIZADO');
  }
}

export class ErrorProhibido extends ErrorNegocio {
  constructor(mensaje = 'No tienes permiso para realizar esta acción.', codigo = 'PROHIBIDO') {
    super(mensaje, 403, codigo);
  }
}

export class ErrorNoEncontrado extends ErrorNegocio {
  constructor() {
    super('No se encontró el recurso solicitado.', 404, 'NO_ENCONTRADO');
  }
}

export class ErrorConflicto extends ErrorNegocio {
  constructor(mensaje: string) {
    super(mensaje, 409, 'CONFLICTO');
  }
}

export class ErrorServicioNoDisponible extends ErrorNegocio {
  constructor() {
    super(
      'No se pudo conectar con la base de datos. Intenta nuevamente en unos momentos.',
      503,
      'BD_NO_DISPONIBLE',
    );
  }
}
