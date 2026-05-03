import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  RequestUploadUrlDto,
  REQUEST_UPLOAD_ALBUM_SHORT_CODE_MESSAGE,
} from '../request-upload-url.dto';

describe('RequestUploadUrlDto', () => {
  const basePayload = {
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
  };

  it('accepts a slug-style album short code', async () => {
    const dto = plainToInstance(RequestUploadUrlDto, {
      ...basePayload,
      albumShortCode: 'family-reunion-2026',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts a legacy 8-character album short code', async () => {
    const dto = plainToInstance(RequestUploadUrlDto, {
      ...basePayload,
      albumShortCode: '3mH8cQpL',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('reports a human-readable error for invalid album short codes', async () => {
    const dto = plainToInstance(RequestUploadUrlDto, {
      ...basePayload,
      albumShortCode: 'invalid code!',
    });

    const errors = await validate(dto);
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    expect(messages).toContain(REQUEST_UPLOAD_ALBUM_SHORT_CODE_MESSAGE);
    expect(messages.join(' ')).not.toContain('regular expression');
  });
});
