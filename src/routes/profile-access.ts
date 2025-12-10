import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import User from '../models/User';
import FarmerProfile from '../models/FarmerProfile';
import AgentProfile from '../models/AgentProfile';
import QRCode from 'qrcode';
import crypto from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to generate QR token
const generateQRToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * @route   GET /api/profile-access/qr/:userId
 * @desc    Generate QR code for a user
 * @access  Private (Agent/Admin)
 */
router.get('/qr/:userId', authenticate, authorize('agent', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { userId } = req.params;

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            sendError(res, 'User not found', 404);
            return;
        }

        // Check/Create QR token
        if (!user.qr_code_token) {
            user.qr_code_token = generateQRToken();
            await user.save();
        }

        // Generate QR Code data URL
        // The data encoded is the token. The frontend scan app will use this token to query the scan endpoint.
        const qrData = user.qr_code_token;
        const qrImage = await QRCode.toDataURL(qrData);

        sendSuccess(res, {
            userId: user._id,
            qr_code_token: user.qr_code_token,
            qr_image: qrImage
        }, 'QR Code generated successfully');
    } catch (error: any) {
        console.error('QR Generate error:', error);
        sendError(res, 'Failed to generate QR code', 500);
    }
}));

/**
 * @route   GET /api/profile-access/scan/:token
 * @desc    Get user info by scanning QR token
 * @access  Public (or semi-private if app requires login first)
 */
router.get('/scan/:token', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { token } = req.params;

        const user = await User.findOne({ qr_code_token: token }).select('-password -__v');

        if (!user) {
            sendError(res, 'Invalid QR code or user not found', 404);
            return;
        }

        let profile = null;
        if (user.role === 'farmer') {
            profile = await FarmerProfile.findOne({ user_id: user._id });
        } else if (user.role === 'agent') {
            profile = await AgentProfile.findOne({ user_id: user._id });
        }

        sendSuccess(res, {
            user,
            profile
        }, 'User profile found');

    } catch (error: any) {
        console.error('Scan error:', error);
        sendError(res, 'Failed to scan QR code', 500);
    }
}));

/**
 * @route   PUT /api/profile-access/scan/:token
 * @desc    Update user info by scanning QR token
 * @access  Private (Agent/Admin) - assuming the person scanning is an agent/admin
 */
router.put('/scan/:token', authenticate, authorize('agent', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { token } = req.params;
        const updateData = req.body;

        const user = await User.findOne({ qr_code_token: token });

        if (!user) {
            sendError(res, 'Invalid QR code or user not found', 404);
            return;
        }

        // Update basic info
        if (updateData.full_name) user.full_name = updateData.full_name;
        if (updateData.phone) user.phone = updateData.phone;
        if (updateData.email) user.email = updateData.email;
        await user.save();

        // Update Profile if farmer
        if (user.role === 'farmer' && updateData.profile) {
            const profileFields = updateData.profile;
            await FarmerProfile.findOneAndUpdate(
                { user_id: user._id },
                profileFields,
                { new: true, upsert: true }
            );
        }

        sendSuccess(res, { userId: user._id }, 'User updated successfully');

    } catch (error: any) {
        console.error('Scan update error:', error);
        sendError(res, 'Failed to update user via scan', 500);
    }
}));

/**
 * @route   POST /api/profile-access/import
 * @desc    Import users from Excel
 * @access  Private (Admin)
 */
router.post('/import', authenticate, authorize('admin', 'admin'), upload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.file) {
            sendError(res, 'No file uploaded', 400);
            return;
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
            return sendError(res, 'The uploaded Excel file contains no sheets.', 400);
        }
        
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
            return sendError(res, 'Could not find the first sheet in the Excel file.', 400);
        }

        const data: any[] = XLSX.utils.sheet_to_json(sheet);

        const result = {
            total: data.length,
            imported: 0,
            failed: 0,
            errors: [] as any[]
        };

        console.log(`Starting import of ${data.length} records...`);

        // Process in chunks or sequentially
        // For 1500 users, sequential is fine for now, or Promise.all in chunks.
        // We'll do sequential to avoid race conditions or DB pressure and for better error reporting.

        for (const row of data) {
            try {
                // Expected columns: full_name, email, phone, role (default farmer), province, district...
                // We'll generate a password if not provided

                const email = row.email?.trim() || `farmer_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`; // Fallback email generator?

                // Basic validation
                if (!row.full_name) {
                    result.failed++;
                    result.errors.push({ row, error: 'Missing full_name' });
                    continue;
                }

                const existingUser = await User.findOne({ email });
                if (existingUser) {
                    result.failed++;
                    result.errors.push({ email, error: 'User already exists' });
                    continue;
                }

                const password = row.password ? String(row.password) : 'password123'; // Default password

                const newUser = new User({
                    full_name: row.full_name,
                    email: email,
                    phone: row.phone,
                    password: password, // will be hashed by pre-save
                    role: row.role || 'farmer',
                    status: 'active',
                    qr_code_token: generateQRToken()
                });

                await newUser.save();

                // Create Profile
                if (newUser.role === 'farmer') {
                    const profile = new FarmerProfile({
                        user_id: newUser._id,
                        province: row.province,
                        district: row.district,
                        sector: row.sector,
                        cell: row.cell,
                        village: row.village,
                        // Add other mapping logic here based on Excel columns
                        id_number: row.id_number,
                    });
                    await profile.save();
                }

                result.imported++;

            } catch (err: any) {
                result.failed++;
                result.errors.push({ row, error: err.message });
            }
        }

        return sendSuccess(res, result, 'Import completed');

    } catch (error: any) {
        console.error('Import error:', error);
        return sendError(res, 'Failed to import users', 500);
    }
}));

export default router;
