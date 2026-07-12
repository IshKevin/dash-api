import { Router, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { validateIdParam, validatePagination } from '../middleware/validation';
import { sendSuccess, sendCreated, sendError, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { putObject, getPrivateObjectStream, PRIVATE_PREFIX } from '../config/minio';

const router = Router();

const privateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JPEG, PNG, WEBP and PDF are allowed.'));
    }
  },
});

function buildPrivateKey(originalName: string): string {
  const namePart = (originalName.split('.')[0] || 'file').replace(/[^a-zA-Z0-9]/g, '_');
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  return `${PRIVATE_PREFIX}/${namePart}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

// A document is accessible to: its owner, any admin, or the agent assigned to
// its linked service request (if any).
async function canAccessDocument(req: AuthenticatedRequest, doc: { owner_id: string; service_request_id: string | null }): Promise<boolean> {
  if (req.user?.role === 'admin') return true;
  if (doc.owner_id === req.user?.id) return true;
  if (req.user?.role === 'agent' && doc.service_request_id) {
    const serviceRequest = await prisma.serviceRequest.findUnique({ where: { id: doc.service_request_id }, select: { agent_id: true } });
    return serviceRequest?.agent_id === req.user.id;
  }
  return false;
}

/**
 * @route   GET /api/documents
 * @desc    List documents owned by the current user (admin can filter by owner_id)
 * @access  Private
 */
router.get('/', authenticate, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const where: any = {};
  if (req.user?.role === 'admin' && req.query.owner_id) {
    where.owner_id = req.query.owner_id as string;
  } else {
    where.owner_id = req.user!.id;
  }
  if (req.query.type) where.type = req.query.type as string;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.document.count({ where }),
  ]);

  sendPaginatedResponse(res, documents, total, page, limit, 'Documents retrieved successfully');
}));

/**
 * @route   GET /api/documents/:id
 * @desc    Get a document's metadata
 * @access  Private (owner, assigned agent, or admin)
 */
router.get('/:id', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document) { sendNotFound(res, 'Document not found'); return; }

  if (!(await canAccessDocument(req, document))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  sendSuccess(res, document, 'Document retrieved successfully');
}));

/**
 * @route   GET /api/documents/:id/download
 * @desc    Stream a document's file from private storage
 * @access  Private (owner, assigned agent, or admin)
 */
router.get('/:id/download', authenticate, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document) { sendNotFound(res, 'Document not found'); return; }

  if (!(await canAccessDocument(req, document))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  const { stream, contentType } = await getPrivateObjectStream(document.file_key);
  res.setHeader('Content-Type', contentType || document.mimetype);
  res.setHeader('Content-Disposition', `attachment; filename="${document.file_key.split('/').pop()}"`);
  stream.pipe(res);
}));

/**
 * @route   POST /api/documents/:id/signature
 * @desc    Attach a captured signature image to a document
 * @access  Private (owner, assigned agent, or admin)
 */
router.post('/:id/signature', authenticate, validateIdParam, privateUpload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document) { sendNotFound(res, 'Document not found'); return; }

  if (!(await canAccessDocument(req, document))) {
    sendError(res, 'Access denied', 403);
    return;
  }

  if (!req.file) { sendError(res, 'A signature image file is required', 400); return; }
  if (document.signature_id) { sendError(res, 'This document already has a signature', 400); return; }

  const key = buildPrivateKey(req.file.originalname || 'signature.png');
  await putObject(key, req.file.buffer, req.file.mimetype);

  const signature = await prisma.signature.create({
    data: {
      reference_id: `SIG-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      signer_id: req.user!.id,
      image_url: key,
      image_key: key,
      ip_address: req.ip,
    },
  });

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: { signature_id: signature.id },
  });

  sendCreated(res, { document: updated, signature }, 'Signature attached successfully');
}));

/**
 * @route   POST /api/documents/:id/notarize
 * @desc    Upload a physically notarized copy of a document for review
 * @access  Private (Agent, Admin)
 */
router.post('/:id/notarize', authenticate, authorize('agent', 'admin'), validateIdParam, privateUpload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document) { sendNotFound(res, 'Document not found'); return; }

  if (!req.file) { sendError(res, 'A notarized document file is required', 400); return; }

  const key = buildPrivateKey(req.file.originalname || 'notarized.pdf');
  await putObject(key, req.file.buffer, req.file.mimetype);

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      file_url: key,
      file_key: key,
      mimetype: req.file.mimetype,
      version: document.version + 1,
      status: 'pending_notarization',
      uploaded_by: req.user!.id,
      rejection_reason: null,
    },
  });

  sendSuccess(res, updated, 'Notarized document submitted for review');
}));

/**
 * @route   PUT /api/documents/:id/notarize-review
 * @desc    Approve or reject a document pending notarization review
 * @access  Private (Admin only)
 */
router.put('/:id/notarize-review', authenticate, authorize('admin'), validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { approved, rejection_reason } = req.body;

  if (typeof approved !== 'boolean') { sendError(res, 'approved must be a boolean', 400); return; }
  if (!approved && !rejection_reason) { sendError(res, 'rejection_reason is required when rejecting', 400); return; }

  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document) { sendNotFound(res, 'Document not found'); return; }

  if (document.status !== 'pending_notarization') {
    sendError(res, `Cannot review a document with status "${document.status}"`, 400);
    return;
  }

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: approved
      ? { status: 'notarized', rejection_reason: null }
      : { status: 'rejected', rejection_reason },
  });

  sendSuccess(res, updated, `Document ${approved ? 'notarized' : 'rejected'} successfully`);
}));

export default router;
