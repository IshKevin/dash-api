import multer, { StorageEngine } from 'multer';
import { Request } from 'express';
import crypto from 'crypto';
import { putObject, getPublicUrl, PUBLIC_PREFIX } from '../config/minio';

const memoryStorage = multer.memoryStorage();

function buildObjectKey(originalName: string): string {
  const namePart = (originalName.split('.')[0] || 'file').replace(/[^a-zA-Z0-9]/g, '_');
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  return `${PUBLIC_PREFIX}/${namePart}-${uniqueSuffix}${ext}`;
}

// Ordinary uploads (profile/product images) go to the public/ prefix, matching
// the old Cloudinary behavior of permanent, unauthenticated URLs. Sensitive
// documents (contracts, signatures, notarized uploads) use putObject directly
// with a private/ key from src/services/documentService.ts instead of this
// middleware.
class MinioStorage implements StorageEngine {
  _handleFile(req: Request, file: Express.Multer.File, cb: (error?: any, info?: Partial<Express.Multer.File>) => void) {
    memoryStorage._handleFile(req, file, async (err, info) => {
      if (err) {
        cb(err);
        return;
      }

      const buffer = info?.buffer as Buffer;
      const key = buildObjectKey(file.originalname || 'file');

      try {
        await putObject(key, buffer, file.mimetype);
        cb(null, {
          path: getPublicUrl(key),
          filename: key,
          size: buffer.length,
        });
      } catch (uploadError) {
        cb(uploadError);
      }
    });
  }

  _removeFile(req: Request, file: Express.Multer.File, cb: (error: Error | null) => void) {
    memoryStorage._removeFile(req, file, cb);
  }
}

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (
    file.mimetype === 'image/jpeg' ||
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/webp' ||
    file.mimetype === 'application/pdf'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only JPEG, PNG, WEBP and PDF are allowed.'));
  }
};

export const upload = multer({
  storage: new MinioStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});
