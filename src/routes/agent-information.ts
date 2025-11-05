import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError, sendCreated } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import User from '../models/User';
import AgentProfile from '../models/AgentProfile';

const router = Router();

// Debug route to test if routes are loaded
router.get('/test', (_req, res) => {
  res.json({
    success: true,
    message: 'Agent Information routes are working!',
    timestamp: new Date().toISOString(),
    endpoint: '/api/agent-information/test'
  });
});

console.log('🔗 Agent Information routes module loaded');

// Define proper interface for agent information response
interface AgentInformationResponse {
  user_info: {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
    role: string;
    status: string;
    created_at: Date;
    updated_at: Date;
  };
  agent_profile: AgentProfileData | null;
}

interface AgentProfileData {
  agentId: string;
  location?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  specialization?: string;
  experience?: string;
  certification?: string;
  farmersAssisted?: number;
  totalTransactions?: number;
  performance?: string;
  profileImage?: string;
}

/**
 * Helper function to build location string
 */
function buildLocationString(profile: any): string {
  const parts: string[] = [];
  
  if (profile.sector) parts.push(profile.sector);
  if (profile.district) parts.push(profile.district);
  if (profile.province) parts.push(profile.province);
  parts.push('Rwanda');
  
  return parts.join(', ');
}

/**
 * Helper function to transform agent data for response
 */
function transformAgentDataForResponse(user: any, profile: any = null): AgentInformationResponse {
  const response: AgentInformationResponse = {
    user_info: {
      id: user._id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at
    },
    agent_profile: null
  };

  if (profile) {
    response.agent_profile = {
      agentId: profile.agentId,
      location: buildLocationString(profile),
      province: profile.province,
      district: profile.district,
      sector: profile.sector,
      cell: profile.cell,
      village: profile.village,
      specialization: profile.specialization,
      experience: profile.experience,
      certification: profile.certification,
      farmersAssisted: profile.farmersAssisted || 0,
      totalTransactions: profile.totalTransactions || 0,
      performance: profile.performance,
      profileImage: profile.profileImage
    };
  }

  return response;
}

/**
 * @route   GET /api/agent-information
 * @desc    Get agent information and profile
 * @access  Private (Agents only)
 */
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      sendError(res, 'User ID not found in token', 401);
      return;
    }
    
    // Get user basic information
    const user = await User.findById(userId).select('-password -__v');
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    // Check if user is an agent
    if (user.role !== 'agent') {
      sendError(res, 'Access denied. This endpoint is for agents only', 403);
      return;
    }

    // Get agent profile
    const profile = await AgentProfile.findOne({ user_id: userId });

    const agentData = transformAgentDataForResponse(user, profile);
    
    sendSuccess(res, agentData, 'Profile retrieved successfully');
  } catch (error: any) {
    console.error('Get agent information error:', error);
    sendError(res, 'Failed to retrieve agent information', 500);
  }
}));

/**
 * @route   PUT /api/agent-information
 * @desc    Update agent profile information
 * @access  Private (Agents only)
 */
router.put('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const updateData = req.body;

    if (!userId) {
      sendError(res, 'User ID not found in token', 401);
      return;
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    // Check if user is an agent
    if (user.role !== 'agent') {
      sendError(res, 'Access denied. This endpoint is for agents only', 403);
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

    // Update agent profile data
    const profileData: any = {};
    
    // Agent Information
    if (updateData.province) profileData.province = updateData.province;
    if (updateData.district) profileData.district = updateData.district;
    if (updateData.sector) profileData.sector = updateData.sector;
    if (updateData.cell) profileData.cell = updateData.cell;
    if (updateData.village) profileData.village = updateData.village;
    if (updateData.specialization) profileData.specialization = updateData.specialization;
    if (updateData.experience) profileData.experience = updateData.experience;
    if (updateData.certification) profileData.certification = updateData.certification;
    if (updateData.farmersAssisted !== undefined) profileData.farmersAssisted = updateData.farmersAssisted;
    if (updateData.totalTransactions !== undefined) profileData.totalTransactions = updateData.totalTransactions;
    if (updateData.performance) profileData.performance = updateData.performance;
    if (updateData.profileImage) profileData.profileImage = updateData.profileImage;

    let profile = null;
    if (Object.keys(profileData).length > 0) {
      profile = await AgentProfile.findOneAndUpdate(
        { user_id: userId },
        profileData,
        { new: true, upsert: true }
      );
    } else {
      profile = await AgentProfile.findOne({ user_id: userId });
    }

    // Get updated user data
    const updatedUser = await User.findById(userId).select('-password -__v');
    const agentData = transformAgentDataForResponse(updatedUser, profile);
    
    sendSuccess(res, agentData, 'Profile updated successfully');
  } catch (error: any) {
    console.error('Update agent information error:', error);
    sendError(res, 'Failed to update agent information', 500);
  }
}));

/**
 * @route   POST /api/agent-information/create
 * @desc    Create agent profile (for agents who don't have a profile yet)
 * @access  Private (Agents only)
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

    if (user.role !== 'agent') {
      sendError(res, 'Only agents can create agent profiles', 403);
      return;
    }

    // Check if profile already exists
    const existingProfile = await AgentProfile.findOne({ user_id: userId });
    if (existingProfile) {
      sendError(res, 'Agent profile already exists', 400);
      return;
    }

    // Generate next agent ID
    const nextAgentId = await (AgentProfile as any).getNextAgentId();

    // Create new agent profile
    const profileData = {
      user_id: userId,
      agentId: nextAgentId,
      ...req.body
    };

    const newProfile = new AgentProfile(profileData);
    const savedProfile = await newProfile.save();

    const agentData = transformAgentDataForResponse(user, savedProfile);
    
    sendCreated(res, agentData, 'Profile created successfully');
  } catch (error: any) {
    console.error('Create agent profile error:', error);
    sendError(res, 'Failed to create agent profile', 500);
  }
}));

/**
 * @route   PUT /api/agent-information/performance
 * @desc    Update agent performance metrics (quick update for specific fields)
 * @access  Private (Agents only)
 */
router.put('/performance', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { farmersAssisted, totalTransactions, performance } = req.body;

    if (!userId) {
      sendError(res, 'User ID not found in token', 401);
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    if (user.role !== 'agent') {
      sendError(res, 'Only agents can update performance metrics', 403);
      return;
    }

    const updateData: any = {};
    if (farmersAssisted !== undefined) updateData.farmersAssisted = farmersAssisted;
    if (totalTransactions !== undefined) updateData.totalTransactions = totalTransactions;
    if (performance) updateData.performance = performance;

    if (Object.keys(updateData).length === 0) {
      sendError(res, 'No valid performance data provided', 400);
      return;
    }

    const profile = await AgentProfile.findOneAndUpdate(
      { user_id: userId },
      updateData,
      { new: true, upsert: true }
    );

    const agentData = transformAgentDataForResponse(user, profile);
    
    sendSuccess(res, agentData, 'Performance metrics updated successfully');
  } catch (error: any) {
    console.error('Update performance metrics error:', error);
    sendError(res, 'Failed to update performance metrics', 500);
  }
}));

export default router;
