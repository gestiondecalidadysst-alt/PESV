import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Límite de intentos en memoria por clave (por ejemplo «ingresar:IP»). Sirve para una sola
 * instancia de la API, que es el despliegue previsto en un VPS; con varias instancias habría
 * que moverlo a la base de datos o a Redis.
 */
export class Limitador {
  private readonly intentos = new Map<string, number[]>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {}

  verificar(clave: string, ahora = Date.now()) {
    const recientes = (this.intentos.get(clave) ?? []).filter((t) => ahora - t < this.ventanaMs);
    if (recientes.length >= this.maximo) {
      const espera = Math.ceil((this.ventanaMs - (ahora - recientes[0]!)) / 60_000);
      throw new HttpException(`Demasiados intentos. Espera ${espera} minuto${espera === 1 ? '' : 's'} y vuelve a intentarlo.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    recientes.push(ahora);
    this.intentos.set(clave, recientes);
    if (this.intentos.size > 10_000) this.limpiar(ahora);
  }

  private limpiar(ahora: number) {
    for (const [k, v] of this.intentos) if (v.every((t) => ahora - t >= this.ventanaMs)) this.intentos.delete(k);
  }
}
