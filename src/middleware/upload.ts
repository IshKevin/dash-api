import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary';
import { Request } from 'express';

interface CloudinaryParams {
    folder: string;
    allowed_formats: string[];
    transformation?: object[];
}

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'avocado_dashboard',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        public_id: (_req: Request, file: Express.Multer.File) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            const originalName = file && file.originalname ? file.originalname : 'file';
            const namePart = originalName.split('.')[0] || 'file';
            const name = namePart.replace(/[^a-zA-Z0-9]/g, '_');
            return `${name}-${uniqueSuffix}`;
        },
    } as unknown as CloudinaryParams, // Cast to handle loose typing for CloudinaryStorage params
});

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
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});
