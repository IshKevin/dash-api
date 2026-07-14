import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { env } from './environment';
import logger from './logger';

export const MINIO_BUCKET = env.MINIO_BUCKET;

// Ordinary assets (product/profile images) live under this prefix and are
// world-readable via a scoped bucket policy — matching the old Cloudinary
// behavior of permanent, unauthenticated URLs.
export const PUBLIC_PREFIX = 'public';

// Sensitive documents (contracts, notarized uploads, signature captures) live
// under this prefix. It is NOT covered by the bucket's public-read policy —
// these objects are only retrievable via an authenticated proxy endpoint
// (see src/routes/documents.ts) that streams them after an ownership check.
export const PRIVATE_PREFIX = 'private';

export const s3Client = new S3Client({
  endpoint: `http${env.MINIO_USE_SSL ? 's' : ''}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1', // required by the SDK, ignored by MinIO
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

export function getPublicUrl(key: string): string {
  const base = env.MINIO_PUBLIC_URL || `http${env.MINIO_USE_SSL ? 's' : ''}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`;
  return `${base}/${MINIO_BUCKET}/${key}`;
}

export async function getPrivateObjectStream(key: string): Promise<{ stream: Readable; contentType?: string }> {
  const result = await s3Client.send(new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key }));
  return { stream: result.Body as Readable, contentType: result.ContentType };
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const upload = new Upload({
    client: s3Client,
    params: { Bucket: MINIO_BUCKET, Key: key, Body: body, ContentType: contentType },
  });
  await upload.done();
}

// Only the public/ prefix is world-readable — private/ objects are excluded
// from this policy and can only be fetched with our own credentials.
function scopedPublicReadPolicy(bucket: string) {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/${PUBLIC_PREFIX}/*`],
      },
    ],
  });
}

export async function ensureBucketExists(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
  } catch {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
      logger.info(`Created MinIO bucket: ${MINIO_BUCKET}`);
    } catch (createError: any) {
      logger.error(`Failed to ensure MinIO bucket "${MINIO_BUCKET}" exists: ${createError.message}`);
      return;
    }
  }

  try {
    await s3Client.send(new PutBucketPolicyCommand({ Bucket: MINIO_BUCKET, Policy: scopedPublicReadPolicy(MINIO_BUCKET) }));
  } catch (policyError: any) {
    logger.error(`Failed to set scoped public-read policy on MinIO bucket "${MINIO_BUCKET}": ${policyError.message}`);
  }
}
