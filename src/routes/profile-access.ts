import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import User from '../models/User';
import FarmerProfile from '../models/FarmerProfile';
import AgentProfile from '../models/AgentProfile';
import AccessKey from '../models/AccessKey';
import QRCode from 'qrcode';
import { generateAccessKey, generateQRToken, isValidAccessKeyFormat } from '../utils/accessKey';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
 * @route   POST /api/profile-access/bulk-import
 * @desc    Import users from Excel/JSON and generate access keys
 * @access  Private (Admin)
 */
router.post('/bulk-import', authenticate, authorize('admin'), upload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        let userData: any[] = [];

        if (req.file) {
            // Handle Excel file
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];

            if (!sheetName) {
                return sendError(res, 'The uploaded Excel file contains no sheets.', 400);
            }
            
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) {
                return sendError(res, 'Could not find the first sheet in the Excel file.', 400);
            }

            userData = XLSX.utils.sheet_to_json(sheet);
        } else if (req.body.users && Array.isArray(req.body.users)) {
            // Handle JSON data
            userData = req.body.users;
        } else {
            return sendError(res, 'No file uploaded or users data provided', 400);
        }

        const result = {
            total: userData.length,
            imported: 0,
            failed: 0,
            errors: [] as any[],
            access_keys: [] as any[]
        };

        console.log(`Starting import of ${userData.length} records...`);

        for (const row of userData) {
            try {
                // Basic validation
                if (!row.full_name) {
                    result.failed++;
                    result.errors.push({ row, error: 'Missing full_name' });
                    continue;
                }

                // Generate unique email if not provided
                const email = row.email?.trim() || `user_${Date.now()}_${Math.random().toString(36).substring(7)}@temp.local`;

                // Check if user already exists
                const existingUser = await User.findOne({ email });
                if (existingUser) {
                    result.failed++;
                    result.errors.push({ email, error: 'User already exists' });
                    continue;
                }

                // Create user with temporary password
                const tempPassword = `temp_${Math.random().toString(36).substring(7)}`;
                const newUser = new User({
                    full_name: row.full_name,
                    email: email,
                    phone: row.phone,
                    password: tempPassword,
                    role: row.role || 'farmer',
                    status: 'active',
                    qr_code_token: generateQRToken(),
                    profile: {
                        age: row.age,
                        gender: row.gender,
                        marital_status: row.marital_status,
                        education_level: row.education_level,
                        province: row.province,
                        district: row.district,
                        sector: row.sector,
                        cell: row.cell,
                        village: row.village,
                        service_areas: row.service_areas ? row.service_areas.split(',').map((s: string) => s.trim()) : [],
                        farm_details: row.farm_size ? {
                            farm_location: {
                                province: row.province,
                                district: row.district,
                                sector: row.sector,
                                cell: row.cell,
                                village: row.village
                            },
                            farm_age: row.farm_age,
                            planted: row.planted,
                            avocado_type: row.avocado_type,
                            mixed_percentage: row.mixed_percentage,
                            farm_size: row.farm_size,
                            tree_count: row.tree_count,
                            upi_number: row.upi_number,
                            assistance: row.assistance
                        } : undefined
                    }
                });

                await newUser.save();

                // Generate access key
                const accessKey = generateAccessKey();
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

                const newAccessKey = new AccessKey({
                    user_id: newUser._id,
                    access_key: accessKey,
                    expires_at: expiresAt
                });

                await newAccessKey.save();

                result.imported++;
                result.access_keys.push({
                    user_id: newUser._id,
                    full_name: newUser.full_name,
                    email: newUser.email,
                    access_key: accessKey,
                    qr_token: newUser.qr_code_token
                });

            } catch (err: any) {
                result.failed++;
                result.errors.push({ row, error: err.message });
            }
        }

        return sendSuccess(res, result, 'Bulk import completed');

    } catch (error: any) {
        console.error('Bulk import error:', error);
        return sendError(res, 'Failed to import users', 500);
    }
}));

/**
 * @route   POST /api/profile-access/verify-access-key
 * @desc    Verify access key and get user info for profile editing
 * @access  Public
 */
router.post('/verify-access-key', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { access_key } = req.body;

        if (!access_key || !isValidAccessKeyFormat(access_key)) {
            sendError(res, 'Invalid access key format', 400);
            return;
        }

        const accessKeyDoc = await AccessKey.findOne({
            access_key,
            is_used: false,
            expires_at: { $gt: new Date() }
        }).populate('user_id');

        if (!accessKeyDoc) {
            sendError(res, 'Invalid or expired access key', 404);
            return;
        }

        const user = accessKeyDoc.user_id as any;

        sendSuccess(res, {
            user: {
                id: user._id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                profile: user.profile
            },
            access_key_id: accessKeyDoc._id
        }, 'Access key verified successfully');

    } catch (error: any) {
        console.error('Access key verification error:', error);
        sendError(res, 'Failed to verify access key', 500);
    }
}));

/**
 * @route   PUT /api/profile-access/update-profile
 * @desc    Update user profile using access key
 * @access  Public (with valid access key)
 */
router.put('/update-profile', asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { access_key, profile_data } = req.body;

        if (!access_key || !isValidAccessKeyFormat(access_key)) {
            sendError(res, 'Invalid access key format', 400);
            return;
        }

        const accessKeyDoc = await AccessKey.findOne({
            access_key,
            is_used: false,
            expires_at: { $gt: new Date() }
        });

        if (!accessKeyDoc) {
            sendError(res, 'Invalid or expired access key', 404);
            return;
        }

        const user = await User.findById(accessKeyDoc.user_id);
        if (!user) {
            sendError(res, 'User not found', 404);
            return;
        }

        // Update user profile
        if (profile_data.full_name) user.full_name = profile_data.full_name;
        if (profile_data.phone) user.phone = profile_data.phone;
        if (profile_data.email) user.email = profile_data.email;
        
        // Update profile object
        if (profile_data.profile) {
            user.profile = { ...user.profile, ...profile_data.profile };
        }

        await user.save();

        // Mark access key as used
        accessKeyDoc.is_used = true;
        await accessKeyDoc.save();

        sendSuccess(res, {
            user: user.toPublicJSON()
        }, 'Profile updated successfully');

    } catch (error: any) {
        console.error('Profile update error:', error);
        sendError(res, 'Failed to update profile', 500);
    }
}));

/**
 * @route   GET /api/profile-access/generate-qr/:userId
 * @desc    Generate QR code containing access key for a user
 * @access  Private (Agent/Admin)
 */
router.get('/generate-qr/:userId', authenticate, authorize('agent', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            sendError(res, 'User not found', 404);
            return;
        }

        // Generate new access key
        const accessKey = generateAccessKey();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry for QR codes

        const newAccessKey = new AccessKey({
            user_id: user._id,
            access_key: accessKey,
            expires_at: expiresAt
        });

        await newAccessKey.save();

        // Generate QR Code with access key
        const qrData = JSON.stringify({
            access_key: accessKey,
            user_name: user.full_name,
            expires_at: expiresAt.toISOString()
        });
        
        const qrImage = await QRCode.toDataURL(qrData);

        sendSuccess(res, {
            user_id: user._id,
            user_name: user.full_name,
            access_key: accessKey,
            qr_image: qrImage,
            expires_at: expiresAt
        }, 'QR Code generated successfully');

    } catch (error: any) {
        console.error('QR Generate error:', error);
        sendError(res, 'Failed to generate QR code', 500);
    }
}));

export default router;
