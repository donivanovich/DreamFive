import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { API_ENV } from '../../config/app-config.module.js';
import type { ApiEnv } from '../../config/env.schema.js';

interface BinaryReply {
  type(contentType: string): BinaryReply;
  send(payload: unknown): unknown;
}

const SAFE_AVATAR_FILENAME_REGEX = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/;

const CONTENT_TYPE_BY_EXT: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  @Get('avatars/:filename')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Header('Cache-Control', 'public, max-age=86400')
  async serveAvatar(@Param('filename') filename: string, @Res() reply: BinaryReply): Promise<void> {
    if (!SAFE_AVATAR_FILENAME_REGEX.test(filename)) {
      throw new BadRequestException('Nombre de archivo inválido.');
    }

    const avatarsDir = join(resolve(this.env.UPLOAD_DIR), 'avatars');
    const filePath = join(avatarsDir, filename);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Avatar no encontrado.');
    }

    const buffer = await readFile(filePath);
    const contentType = CONTENT_TYPE_BY_EXT[extname(filename).toLowerCase()] ?? 'image/png';
    void reply.type(contentType).send(buffer);
  }
}
