import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { config } from '../config.js';

/** Quita tildes y caracteres especiales del nombre de un archivo (RN-24): «acta líder.pdf» → «acta_lider.pdf». */
export function nombreSeguro(nombre: string): string {
  const ext = path.extname(nombre).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = path
    .basename(nombre, path.extname(nombre))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'archivo'}${ext}`;
}

/** Almacenamiento de archivos: disco local en desarrollo, S3 (o compatible, como MinIO) en producción. */
@Injectable()
export class StorageService {
  private readonly s3 =
    config.storage.driver === 's3' && config.storage.s3Bucket
      ? new S3Client({ region: config.storage.s3Region, endpoint: config.storage.s3Endpoint, forcePathStyle: Boolean(config.storage.s3Endpoint) })
      : null;

  private clienteS3() {
    if (!this.s3 || !config.storage.s3Bucket) throw new Error('Falta S3_BUCKET para el almacenamiento S3');
    return { s3: this.s3, bucket: config.storage.s3Bucket };
  }

  /** Ruta local dentro de la carpeta de almacenamiento; rechaza claves que intenten salir de ella. */
  private rutaLocal(clave: string): string {
    const raiz = path.resolve(config.storage.localDir);
    const archivo = path.resolve(raiz, clave);
    if (archivo === raiz || !archivo.startsWith(`${raiz}${path.sep}`)) throw new Error('Clave de almacenamiento inválida');
    return archivo;
  }

  async guardar(clave: string, datos: Buffer, tipo: string): Promise<void> {
    if (config.storage.driver === 's3') {
      const { s3, bucket } = this.clienteS3();
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: clave, Body: datos, ContentType: tipo }));
      return;
    }
    const archivo = this.rutaLocal(clave);
    await mkdir(path.dirname(archivo), { recursive: true });
    await writeFile(archivo, datos);
  }

  async leer(clave: string): Promise<Buffer> {
    if (config.storage.driver === 's3') {
      const { s3, bucket } = this.clienteS3();
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
        if (!r.Body) throw new Error('vacío');
        return Buffer.from(await r.Body.transformToByteArray());
      } catch {
        throw new NotFoundException('No se encontró el archivo');
      }
    }
    try {
      return await readFile(this.rutaLocal(clave));
    } catch {
      throw new NotFoundException('No se encontró el archivo');
    }
  }
}

/** Global: evidencias, comité y VIGIA 2 lo usan sin importarlo módulo por módulo. */
@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
