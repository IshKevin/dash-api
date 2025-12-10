import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError, sendCreated } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import User from '../models/User';
import FarmerProfile from '../models/FarmerProfile';

const router = Router();

// Debug route to test if routes are loaded
router.get('/test', (_req, res) => {
  res.json({
    success: true,
    message: 'Farmer Information routes are working!',
    timestamp: new Date().toISOString(),
    endpoint: '/api/farmer-information/test'
  });
});

console.log('🔗 Farmer Information routes module loaded');

// Define proper interface for farmer information response
interface FarmerInformationResponse {
  farmer_id: string;
  user_info: {
    id: string;
    email: string;
    full_name: string;
    phone?: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  };
  farmer_profile: FarmerProfileData | null;
}

interface FarmerProfileData {
  // Personal Information
  age?: number;
  id_number?: string;
  gender?: string;
  marital_status?: string;
  education_level?: string;

  // Personal Location
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;

  // Farm Information
  farm_age?: number;
  planted?: string;
  avocado_type?: string;
  mixed_percentage?: number;
  farm_size?: number;
  tree_count?: number;
  upi_number?: string;

  // Farm Location
  farm_province?: string;
  farm_district?: string;
  farm_sector?: string;
  farm_cell?: string;
  farm_village?: string;

  // Additional fields
  assistance?: string[];
  image?: string;
}

/**
 * Helper function to transform farmer data for response
 */
function transformFarmerDataForResponse(user: any, profile: any = null): FarmerInformationResponse {
  const response: FarmerInformationResponse = {
    farmer_id: user._id,
    user_info: {
      id: user._id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at
    },
    farmer_profile: null
  };

  if (profile) {
    response.farmer_profile = {
      // Personal Information
      age: profile.age,
      id_number: profile.id_number,
      gender: profile.gender,
      marital_status: profile.marital_status,
      education_level: profile.education_level,

      // Personal Location
      province: profile.province,
      district: profile.district,
      sector: profile.sector,
      cell: profile.cell,
      village: profile.village,

      // Farm Information
      farm_age: profile.farm_age,
      planted: profile.planted,
      avocado_type: profile.avocado_type,
      mixed_percentage: profile.mixed_percentage,
      farm_size: profile.farm_size,
      tree_count: profile.tree_count,
      upi_number: profile.upi_number,

      // Farm Location
      farm_province: profile.farm_province,
      farm_district: profile.farm_district,
      farm_sector: profile.farm_sector,
      farm_cell: profile.farm_cell,
      farm_village: profile.farm_village,

      // Additional fields
      assistance: profile.assistance || [],
      image: profile.image || null
    };
  }

  return response;
}

/**
 * @route   GET /api/farmer-information
 * @desc    Get farmer information and profile
 * @access  Private (Farmers, Agents, Admin)
 */
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    let userId = req.user?.id;

    if (!userId) {
      sendError(res, 'User ID not found in token', 401);
      return;
    }

    const requestUser = await User.findById(userId).select('role');

    if (!requestUser) {
      sendError(res, 'User not found', 404);
      return;
    }

    // specific farmer check
    if (req.query.farmerId && (requestUser.role === 'agent' || requestUser.role === 'admin')) {
      userId = req.query.farmerId as string;
    } else if (requestUser.role !== 'farmer') {
      sendError(res, 'Access denied. Only farmers can access their own info, or Agents/Admins can access via farmerId', 403);
      return;
    }

    // Get user basic information
    const user = await User.findById(userId).select('-password -__v');
    if (!user) {
      sendError(res, 'Target user not found', 404);
      return;
    }

    // Check if target user is a farmer
    if (user.role !== 'farmer') {
      sendError(res, 'Target user is not a farmer', 400);
      return;
    }

    // Get farmer profile
    const profile = await FarmerProfile.findOne({ user_id: userId });

    const farmerData = transformFarmerDataForResponse(user, profile);

    sendSuccess(res, farmerData, 'Farmer information retrieved successfully');
  } catch (error: any) {
    console.error('Get farmer information error:', error);
    sendError(res, 'Failed to retrieve farmer information', 500);
  }
}));

/**
 * @route   PUT /api/farmer-information
 * @desc    Update farmer profile information
 * @access  Private (Farmers, Agents, Admin)
 */
router.put('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    let userId = req.user?.id;
    const updateData = req.body;

    if (!userId) {
      sendError(res, 'User ID not found in token', 401);
      return;
    }

    const requestUser = await User.findById(userId).select('role');

    if (!requestUser) {
      sendError(res, 'User not found', 404);
      return;
    }

    // specific farmer check
    if (updateData.farmerId && (requestUser.role === 'agent' || requestUser.role === 'admin')) {
      userId = updateData.farmerId;
    } else if (requestUser.role !== 'farmer') {
      sendError(res, 'Access denied. Only farmers can update their own info, or Agents/Admins can update via farmerId', 403);
      return;
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      sendError(res, 'Target user not found', 404);
      return;
    }

    // Check if target user is a farmer
    if (user.role !== 'farmer') {
      sendError(res, 'Target user is not a farmer', 400);
      return;
    }

    // Update user basic information
    const userUpdateData: any = {};
    if (updateData.full_name) userUpdateData.full_name = updateData.full_name;
    if (updateData.phone) userUpdateData.phone = updateData.phone;
    if (updateData.email) userUpdateData.email = updateData.email;

    if (Object.keys(userUpdateData).length > 0) {
      await User.findByIdAndUpdate(userId, userUpdateData, { new: true });
    }

    // Update farmer profile data
    const profileData: any = {};

    // Personal Information
    if (updateData.age !== undefined) profileData.age = updateData.age;
    if (updateData.id_number) profileData.id_number = updateData.id_number;
    if (updateData.gender) profileData.gender = updateData.gender;
    if (updateData.marital_status) profileData.marital_status = updateData.marital_status;
    if (updateData.education_level) profileData.education_level = updateData.education_level;

    // Personal Location
    if (updateData.province) profileData.province = updateData.province;
    if (updateData.district) profileData.district = updateData.district;
    if (updateData.sector) profileData.sector = updateData.sector;
    if (updateData.cell) profileData.cell = updateData.cell;
    if (updateData.village) profileData.village = updateData.village;

    // Farm Information
    if (updateData.farm_age !== undefined) profileData.farm_age = updateData.farm_age;
    if (updateData.planted) profileData.planted = updateData.planted;
    if (updateData.avocado_type) profileData.avocado_type = updateData.avocado_type;
    if (updateData.mixed_percentage !== undefined) profileData.mixed_percentage = updateData.mixed_percentage;
    if (updateData.farm_size !== undefined) profileData.farm_size = updateData.farm_size;
    if (updateData.tree_count !== undefined) profileData.tree_count = updateData.tree_count;
    if (updateData.upi_number) profileData.upi_number = updateData.upi_number;

    // Farm Location
    if (updateData.farm_province) profileData.farm_province = updateData.farm_province;
    if (updateData.farm_district) profileData.farm_district = updateData.farm_district;
    if (updateData.farm_sector) profileData.farm_sector = updateData.farm_sector;
    if (updateData.farm_cell) profileData.farm_cell = updateData.farm_cell;
    if (updateData.farm_village) profileData.farm_village = updateData.farm_village;

    // Additional fields
    if (updateData.assistance) profileData.assistance = updateData.assistance;
    if (updateData.image) profileData.image = updateData.image;

    let profile = null;
    if (Object.keys(profileData).length > 0) {
      profile = await FarmerProfile.findOneAndUpdate(
        { user_id: userId },
        profileData,
        { new: true, upsert: true }
      );
    } else {
      profile = await FarmerProfile.findOne({ user_id: userId });
    }

    // Get updated user data
    const updatedUser = await User.findById(userId).select('-password -__v');
    const farmerData = transformFarmerDataForResponse(updatedUser, profile);

    sendSuccess(res, farmerData, 'Farmer information updated successfully');
  } catch (error: any) {
    console.error('Update farmer information error:', error);
    sendError(res, 'Failed to update farmer information', 500);
  }
}));

/**
 * @route   POST /api/farmer-information/create
 * @desc    Create farmer profile (for farmers who don't have a profile yet)
 * @access  Private (Farmers only)
 */
router.post('/create', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'User ID not found in token', 401);
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    if (user.role !== 'farmer') {
      sendError(res, 'Only farmers can create farmer profiles', 403);
      return;
    }

    // Check if profile already exists
    const existingProfile = await FarmerProfile.findOne({ user_id: userId });
    if (existingProfile) {
      sendError(res, 'Farmer profile already exists', 400);
      return;
    }

    // Create new farmer profile
    const profileData = {
      user_id: userId,
      ...req.body
    };

    const newProfile = new FarmerProfile(profileData);
    const savedProfile = await newProfile.save();

    const farmerData = transformFarmerDataForResponse(user, savedProfile);

    sendCreated(res, farmerData, 'Farmer profile created successfully');
  } catch (error: any) {
    console.error('Create farmer profile error:', error);
    sendError(res, 'Failed to create farmer profile', 500);
  }
}));

/**
 * @route   PUT /api/farmer-information/tree-count
 * @desc    Update tree count (quick update for specific field)
 * @access  Private (Farmers only)
 */
router.put('/tree-count', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { tree_count } = req.body;

    if (!userId) {
      sendError(res, 'User ID not found in token', 401);
      return;
    }

    if (tree_count === undefined || isNaN(tree_count) || tree_count < 0) {
      sendError(res, 'Valid tree count is required', 400);
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    if (user.role !== 'farmer') {
      sendError(res, 'Only farmers can update tree count', 403);
      return;
    }

    const profile = await FarmerProfile.findOneAndUpdate(
      { user_id: userId },
      { tree_count: tree_count },
      { new: true, upsert: true }
    );

    const farmerData = transformFarmerDataForResponse(user, profile);

    sendSuccess(res, farmerData, 'Tree count updated successfully');
  } catch (error: any) {
    console.error('Update tree count error:', error);
    sendError(res, 'Failed to update tree count', 500);
  }
}));

export default router;