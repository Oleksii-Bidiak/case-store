import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import {
  ALLOWED_IMAGE_MIME_EXT,
  IMAGE_MULTER_MAX_BYTES,
  MAX_FILES_PER_UPLOAD,
} from './image-upload.constants';

/**
 * Multer options for image uploads (TASK-424).
 *
 * Memory storage, always: nothing untrusted may touch the disk before it has
 * been sniffed and re-encoded, and a temp file written by Multer would already
 * be on the disk by the time the service got a look at it.
 *
 * The `fileFilter` here is the FIRST of two MIME gates and is transport-level
 * config — {@link ImageUploadService} re-checks the type and enforces the
 * stricter business size limit, because a service must not assume its transport
 * ran. A wrong-MIME file is a 400 from here; a file whose BYTES are not the
 * declared image is a 415 from the service.
 *
 * @param maxFiles how many files this route accepts (1 for the content routes,
 *        {@link MAX_FILES_PER_UPLOAD} for the product gallery).
 */
export function imageMulterOptions(maxFiles: number = MAX_FILES_PER_UPLOAD) {
  return {
    storage: memoryStorage(),
    limits: { fileSize: IMAGE_MULTER_MAX_BYTES, files: maxFiles },
    fileFilter: (
      _req: unknown,
      file: { mimetype: string },
      cb: (error: Error | null, acceptFile: boolean) => void,
    ): void => {
      if (ALLOWED_IMAGE_MIME_EXT[file.mimetype]) {
        cb(null, true);
      } else {
        cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
      }
    },
  };
}
