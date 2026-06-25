import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly } from '../middleware/auth';
import { sendSuccess, sendCreated, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

// GET /api/training - List published training content
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const { content_type, category, search } = req.query;

    const where: any = { status: 'published' };

    if (content_type) {
      where.content_type = content_type as string;
    }

    if (category) {
      where.category = category as string;
    }

    if (search) {
      where.title = { contains: search as string, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.trainingContent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { published_at: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          content_type: true,
          category: true,
          tags: true,
          view_count: true,
          published_at: true,
          author: { select: { full_name: true } },
        },
      }),
      prisma.trainingContent.count({ where }),
    ]);

    return sendPaginatedResponse(res, items, total, page, limit, 'Training content retrieved successfully');
  })
);

// GET /api/training/all - List all content (admin only)
router.get(
  '/all',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.trainingContent.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          author: { select: { full_name: true } },
        },
      }),
      prisma.trainingContent.count(),
    ]);

    return sendPaginatedResponse(res, items, total, page, limit, 'All training content retrieved successfully');
  })
);

// POST /api/training - Create training content (admin/agent)
router.post(
  '/',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, content, content_type, category, tags } = req.body;

    if (!title || !content) {
      return sendError(res, 'Title and content are required', 400 as any);
    }

    const trainingContent = await prisma.trainingContent.create({
      data: {
        title,
        description: description ?? null,
        content,
        content_type: content_type ?? 'article',
        category: category ?? null,
        tags: tags ?? [],
        status: 'draft',
        author_id: req.user!.id,
      },
      include: {
        author: { select: { full_name: true } },
      },
    });

    return sendCreated(res, trainingContent, 'Training content created successfully');
  })
);

// GET /api/training/:id - Get single training content
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userRole = req.user!.role;

    const trainingContent = await prisma.trainingContent.findUnique({
      where: { id },
      include: {
        author: { select: { full_name: true } },
      },
    });

    if (!trainingContent) {
      return sendNotFound(res, 'Training content not found');
    }

    if (trainingContent.status !== 'published' && userRole !== 'admin' && userRole !== 'agent') {
      return sendError(res, 'Access denied: content is not published', 403 as any);
    }

    await prisma.trainingContent.update({
      where: { id },
      data: { view_count: { increment: 1 } },
    });

    await prisma.contentAccess.create({
      data: {
        content_id: id,
        user_id: req.user!.id,
      },
    });

    return sendSuccess(res, trainingContent, 'Training content retrieved successfully');
  })
);

// PUT /api/training/:id - Update training content (admin/agent)
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, content, content_type, category, tags } = req.body;

    const existing = await prisma.trainingContent.findUnique({ where: { id } });

    if (!existing) {
      return sendNotFound(res, 'Training content not found');
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (content !== undefined) updateData.content = content;
    if (content_type !== undefined) updateData.content_type = content_type;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;

    const updated = await prisma.trainingContent.update({
      where: { id },
      data: updateData,
      include: {
        author: { select: { full_name: true } },
      },
    });

    return sendSuccess(res, updated, 'Training content updated successfully');
  })
);

// PUT /api/training/:id/publish - Publish content (admin only)
router.put(
  '/:id/publish',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const existing = await prisma.trainingContent.findUnique({ where: { id } });

    if (!existing) {
      return sendNotFound(res, 'Training content not found');
    }

    const updated = await prisma.trainingContent.update({
      where: { id },
      data: { status: 'published', published_at: new Date() },
      include: {
        author: { select: { full_name: true } },
      },
    });

    return sendSuccess(res, updated, 'Training content published successfully');
  })
);

// PUT /api/training/:id/archive - Archive content (admin only)
router.put(
  '/:id/archive',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const existing = await prisma.trainingContent.findUnique({ where: { id } });

    if (!existing) {
      return sendNotFound(res, 'Training content not found');
    }

    const updated = await prisma.trainingContent.update({
      where: { id },
      data: { status: 'archived' },
      include: {
        author: { select: { full_name: true } },
      },
    });

    return sendSuccess(res, updated, 'Training content archived successfully');
  })
);

// DELETE /api/training/:id - Delete content (admin only)
router.delete(
  '/:id',
  authenticate,
  adminOnly,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const existing = await prisma.trainingContent.findUnique({ where: { id } });

    if (!existing) {
      return sendNotFound(res, 'Training content not found');
    }

    await prisma.contentAccess.deleteMany({ where: { content_id: id } });
    await prisma.trainingContent.delete({ where: { id } });

    return sendSuccess(res, null, 'Training content deleted successfully');
  })
);

export default router;
