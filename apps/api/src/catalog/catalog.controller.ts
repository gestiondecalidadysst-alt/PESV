import { Publico } from '../auth/decorators.js';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  CLAUSULAS_ISO_39001,
  CORRESPONDENCIA_PESV_ISO,
  ISO_39001_VERSION,
  MODALIDADES,
  NIVELES,
  PASOS_PESV,
  RADIOS_ACCION,
  REGLAS_NIVEL,
  RES_40595_2022,
  type Nivel,
} from '@pesv/shared';

@Publico()
@Controller('catalog')
export class CatalogController {
  @Get('pesv')
  pesv(@Query('nivel') nivel?: string) {
    if (nivel && !NIVELES.includes(nivel as Nivel)) {
      throw new BadRequestException(`Nivel inválido. Usa: ${NIVELES.join(', ')}`);
    }
    const pasos = PASOS_PESV.map((p) => ({
      ...p,
      aplica: nivel ? p.niveles.includes(nivel as Nivel) : undefined,
      clausulasIso: CORRESPONDENCIA_PESV_ISO[p.numero] ?? [],
    }));
    return { version: RES_40595_2022, reglasNivel: REGLAS_NIVEL, pasos };
  }

  @Get('iso39001')
  iso() {
    return {
      version: ISO_39001_VERSION,
      clausulas: CLAUSULAS_ISO_39001,
      correspondencia: CORRESPONDENCIA_PESV_ISO,
    };
  }

  @Get('modalidades')
  modalidades() {
    return { modalidades: MODALIDADES, radiosAccion: RADIOS_ACCION };
  }
}
