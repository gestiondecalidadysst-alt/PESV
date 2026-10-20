import { Publico } from '../auth/decorators.js';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  clasificar,
  entradaClasificacionSchema,
  type EntradaClasificacionInput,
} from '@pesv/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';

@Publico()
@Controller('classification')
export class ClassificationController {
  /** Calcula nivel y pasos aplicables sin guardar nada. */
  @Post('preview')
  @HttpCode(200)
  preview(
    @Body(new ZodValidationPipe(entradaClasificacionSchema)) body: EntradaClasificacionInput,
  ) {
    return clasificar(body);
  }
}
