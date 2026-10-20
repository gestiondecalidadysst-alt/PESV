import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Module } from '@nestjs/common';
import { config } from '../config.js';

export const nombreSeguro = (nombre: string): string => {
  const base = path.basename(nombre).normalize('NFKC').replace(/[^\w. -]/g, '_').trim();
  return base || 'archivo';
};

@Injectable()
export class StorageService {
  private readonly s3 = config.storage.driver === 's3' && config.storage.s3Bucket
    ? new S3Client({
        region: config.storage.s3Region,
        endpoint: config.storage.s3Endpoint,
        forcePathStyle: Boolean(config.storage.s3Endpoint),
      })
    : null;

  async guardar(clave: string, datos: Buffer, tipo: string): Promise<void> {
    if (config.storage.driver === 's3') {
      if (!this.s3 || !config.storage.s3Bucket) throw new Error('Falta S3_BUCKET para el almacenamiento S3');
      await this.s3.send(new PutObjectCommand({
        Bucket: config.storage.s3Bucket,
        Key: clave,
        Body: datos,
        ContentType: tipo,
      }));
      return;
    }

    const archivo = this.rutaLocal(clave);
    await mkdir(path.dirname(archivo), { recursive: true });
    await writeFile(archivo, datos);
  }

  async leer(clave: string): Promise<Buffer> {
    if (config.storage.driver === 's3') {
      if (!this.s3 || !config.storage.s3Bucket) throw new Error('Falta S3_BUCKET para el almacenamiento S3');
      const respuesta = await this.s3.send(new GetObjectCommand({ Bucket: config.storage.s3Bucket, Key: clave }));
      if (!respuesta.Body) throw new Error('El archivo almacenado está vacío');
      return Buffer.from(await respuesta.Body.transformToByteArray());
    }

    return readFile(this.rutaLocal(clave));
  }

  private rutaLocal(clave: string): string {
    const raiz = path.resolve(config.storage.localDir);
    const archivo = path.resolve(raiz, clave);
    if (archivo !== raiz && !archivo.startsWith(`${raiz}${path.sep}`)) {
      throw new Error('Clave de almacenamiento inválida');
    }
    return archivo;
  }
}

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
