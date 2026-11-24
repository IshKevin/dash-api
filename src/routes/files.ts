import { Router, Request, Response } from 'express';
import { getObjectStream, PUBLIC_PREFIX } from '../config/storage';
import logger from '../config/logger';

const router = Router();

/**
 * @route   GET /api/files/public/*
 * @desc    Stream a public object (product/profile images) from object storage.
 *          Only keys under public/ are reachable here — private/ objects are
 *          served exclusively by the authenticated documents endpoints.
 * @access  Public
 */
router.get('/public/*', async (req: Request, res: Response) => {
  const rest = (req.params as Record<string, string>)[0] || '';
  // Reject traversal / odd keys outright; keys are generated server-side and
  // only ever contain [A-Za-z0-9_.-].
  if (!rest || rest.includes('..') || !/^[A-Za-z0-9_.\-/]+$/.test(rest)) {
    res.status(400).json({ success: false, message: 'Invalid file key' });
    return;
  }
  const key = `${PUBLIC_PREFIX}/${rest}`;

  try {
    const { stream, contentType, contentLength, etag } = await getObjectStream(key);
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    if (contentLength !== undefined) res.setHeader('Content-Length', String(contentLength));
    if (etag) res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // The SPA runs on a different origin; helmet's default same-origin CORP
    // header would stop browsers from rendering these images there.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    stream.on('error', (err) => {
      logger.error(`Stream error for ${key}: ${err.message}`);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (error: any) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === 'NoSuchKey' || error?.name === 'NotFound') {
      res.status(404).json({ success: false, message: 'File not found' });
      return;
    }
    logger.error(`Failed to fetch ${key} from storage: ${error?.message}`);
    res.status(502).json({ success: false, message: 'Storage unavailable' });
  }
});

export default router;
