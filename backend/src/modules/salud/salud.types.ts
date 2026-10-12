export interface Salud {
  estado: 'OK';
  baseDatos: 'CONECTADA';
  modo: 'thin';
  fecha: string;
}

export interface SaludRepository {
  verificarConexion(): Promise<void>;
}

export interface SaludService {
  consultar(): Promise<Salud>;
}
