import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { env } from './environment';
import logger from './logger';

/**
 * S3-compatible object storage (SeaweedFS in our Docker stacks; any S3 API
 * works — MinIO, AWS S3, Cloudflare R2 — since only standard calls are used).
 *
 * Access model: the bucket itself is PRIVATE. Nothing relies on bucket
 * policies or anonymous S3 access (SeaweedFS does not support
 * PutBucketPolicy). Instead the API serves objects itself:
 *   - public/  → streamed without auth by GET /api/files/public/<key>
 *                (product/profile images — permanent, shareable URLs)
 *   - private/ → only streamed after an ownership check
 *                (contracts, notarized uploads, signatures — see documents.ts)
 */
export const STORAGE_BUCKET = env.S3_BUCKET;
export const PUBLIC_PREFIX = 'public';
export const PRIVATE_PREFIX = 'private';

export const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

/** Public URL for an object under public/, served through the API. */
export function getPublicUrl(key: string): string {
  const base = (env.PUBLIC_API_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, '');
  return `${base}/api/files/${key}`;
}

export async function getObjectStream(
  key: string
): Promise<{ stream: Readable; contentType?: string; contentLength?: number; etag?: string }> {
  const result = await s3Client.send(new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }));
  return {
    stream: result.Body as Readable,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
    etag: result.ETag,
  };
}

/** Kept for existing callers (documents/private files). */
export const getPrivateObjectStream = getObjectStream;

// IMPORTANT: SeaweedFS accepts a PUT into a bucket that does not exist yet
// (it returns 200) but the object is then unreadable (NoSuchBucket) — a silent
// data loss. So every write first makes sure the bucket exists. The check is
// cached after the first success; a failure clears the cache so it is retried.
let bucketReady: Promise<void> | null = null;

export function ensureBucketReady(): Promise<void> {
  if (!bucketReady) {
    bucketReady = ensureBucketExists().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  return bucketReady;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucketReady();
  const upload = new Upload({
    client: s3Client,
    params: { Bucket: STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType },
  });
  await upload.done();
}

export async function ensureBucketExists(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: STORAGE_BUCKET }));
    return;
  } catch {
    // fall through and create
  }
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: STORAGE_BUCKET }));
    logger.info(`Created storage bucket: ${STORAGE_BUCKET}`);
  } catch (createError: any) {
    logger.error(`Failed to ensure storage bucket "${STORAGE_BUCKET}" exists: ${createError.message}`);
    throw createError;
  }
}

export async function checkStorageHealth(): Promise<boolean> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: STORAGE_BUCKET }));
    return true;
  } catch {
    return false;
  }
}
