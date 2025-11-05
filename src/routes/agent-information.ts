import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
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
  province?: string;
  territory?: Array<{
    district: string;
    sector: string;
    isPrimary: boolean;
    assignedDate: Date;
  }>;
  territoryCoverage?: {
    totalDistricts: number;
    totalSectors: number;
    districts: string[];
  };
  // Legacy fields
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  location?: string;
  specialization?: string;
  experience?: string;
  certification?: string;
  statistics?: {
    farmersAssisted: number;
    totalTransactions: number;
    performance: string;
    activeFarmers: number;
    territoryUtilization: string;
  };
  // Legacy stats (for backward compatibility)
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
 * Helper function to calculate territory coverage
 */
function calculateTerritoryCoverage(territory: any[]): any {
  if (!territory || territory.length === 0) {
    return {
      totalDistricts: 0,
      totalSectors: 0,
      districts: []
    };
  }
  
  const districts = [...new Set(territory.map(t => t.district))];
  
  return {
    totalDistricts: districts.length,
    totalSectors: territory.length,
    districts: districts
  };
}

/**
 * Helper function to transform agent data for AGENT VIEW (full territory format)
 */
function transformAgentDataForAgentView(user: any, profile: any = null): AgentInformationResponse {
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
    // Full view for agents - same as admin
    const profileData: AgentProfileData = {
      agentId: profile.agentId,
      province: profile.province,
      specialization: profile.specialization,
      experience: profile.experience,
      certification: profile.certification,
      profileImage: profile.profileImage
    };
    
    // Add full territory if exists
    if (profile.territory && profile.territory.length > 0) {
      profileData.territory = profile.territory.map((t: any) => ({
        district: t.district,
        sector: t.sector,
        isPrimary: t.isPrimary,
        assignedDate: t.assignedDate
      }));
      
      // Add territory coverage
      profileData.territoryCoverage = calculateTerritoryCoverage(profile.territory);
    }
    
    // Add full statistics object
    if (profile.statistics) {
      profileData.statistics = {
        farmersAssisted: profile.statistics.farmersAssisted || 0,
        totalTransactions: profile.statistics.totalTransactions || 0,
        performance: profile.statistics.performance || '0%',
        activeFarmers: profile.statistics.activeFarmers || 0,
        territoryUtilization: profile.statistics.territoryUtilization || '0%'
      };
    } else {
      // Fallback to legacy fields
      profileData.statistics = {
        farmersAssisted: profile.farmersAssisted || 0,
        totalTransactions: profile.totalTransactions || 0,
        performance: profile.performance || '0%',
        activeFarmers: 0,
        territoryUtilization: '0%'
      };
    }
    
    response.agent_profile = profileData;
  }

  return response;
}

/**
 * Helper function to transform agent data for ADMIN VIEW (full territory details)
 */
function transformAgentDataForAdminView(user: any, profile: any = null): AgentInformationResponse {
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
    const profileData: AgentProfileData = {
      agentId: profile.agentId,
      province: profile.province,
      specialization: profile.specialization,
      experience: profile.experience,
      certification: profile.certification,
      profileImage: profile.profileImage
    };
    
    // Add full territory if exists
    if (profile.territory && profile.territory.length > 0) {
      profileData.territory = profile.territory.map((t: any) => ({
        district: t.district,
        sector: t.sector,
        isPrimary: t.isPrimary,
        assignedDate: t.assignedDate
      }));
      profileData.territoryCoverage = calculateTerritoryCoverage(profile.territory);
    }
    
    // Add full statistics object
    if (profile.statistics) {
      profileData.statistics = {
        farmersAssisted: profile.statistics.farmersAssisted || 0,
        totalTransactions: profile.statistics.totalTransactions || 0,
        performance: profile.statistics.performance || '0%',
        activeFarmers: profile.statistics.activeFarmers || 0,
        territoryUtilization: profile.statistics.territoryUtilization || '0%'
      };
    } else {
      // Legacy support
      profileData.statistics = {
        farmersAssisted: profile.farmersAssisted || 0,
        totalTransactions: profile.totalTransactions || 0,
        performance: profile.performance || '0%',
        activeFarmers: 0,
        territoryUtilization: '0%'
      };
    }
    
    // Also include legacy location fields if they exist
    if (profile.district || profile.sector) {
      profileData.location = buildLocationString(profile);
      profileData.district = profile.district;
      profileData.sector = profile.sector;
      profileData.cell = profile.cell;
      profileData.village = profile.village;
    }
    
    response.agent_profile = profileData;
  }

  return response;
}

/**
 * Legacy function for backward compatibility - uses agent view
 */
function transformAgentDataForResponse(user: any, profile: any = null): AgentInformationResponse {
  return transformAgentDataForAgentView(user, profile);
}

/**
 * @route   GET /api/agent-information
 * @desc    Get agent information and profile (role-based view)
 * @access  Private (Agents and Admins)
 */
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
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

    // Use role-based transformation
    let agentData;
    if (userRole === 'admin') {
      // Admin gets full territory view
      agentData = transformAgentDataForAdminView(user, profile);
    } else {
      // Agent gets simplified legacy view
      agentData = transformAgentDataForAgentView(user, profile);
    }
    
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

    // Check if updating from agent_profile structure
    const agentProfileData = updateData.agent_profile || updateData;
    
    // Update agent profile data
    const profileData: any = {};
    
    // Territory management
    if (agentProfileData.territory) {
      // Validate territory
      if (!Array.isArray(agentProfileData.territory) || agentProfileData.territory.length === 0) {
        sendError(res, 'Territory must be a non-empty array', 400);
        return;
      }
      
      if (agentProfileData.territory.length > 10) {
        sendError(res, 'Maximum 10 sectors allowed in territory', 400);
        return;
      }
      
      // Check if at least one primary sector exists
      const hasPrimary = agentProfileData.territory.some((t: any) => t.isPrimary === true);
      if (!hasPrimary) {
        sendError(res, 'At least one sector must be marked as primary (isPrimary: true)', 400);
        return;
      }
      
      // Map territory with assignedDate
      profileData.territory = agentProfileData.territory.map((t: any) => ({
        district: t.district,
        sector: t.sector,
        isPrimary: t.isPrimary || false,
        assignedDate: t.assignedDate || new Date()
      }));
    }
    
    // Agent Information
    if (agentProfileData.province) profileData.province = agentProfileData.province;
    if (agentProfileData.district) profileData.district = agentProfileData.district;
    if (agentProfileData.sector) profileData.sector = agentProfileData.sector;
    if (agentProfileData.cell) profileData.cell = agentProfileData.cell;
    if (agentProfileData.village) profileData.village = agentProfileData.village;
    if (agentProfileData.specialization) profileData.specialization = agentProfileData.specialization;
    if (agentProfileData.experience) profileData.experience = agentProfileData.experience;
    if (agentProfileData.certification) profileData.certification = agentProfileData.certification;
    if (agentProfileData.profileImage) profileData.profileImage = agentProfileData.profileImage;
    
    // Statistics - support both nested and flat structure
    if (agentProfileData.statistics) {
      profileData.statistics = {
        farmersAssisted: agentProfileData.statistics.farmersAssisted || 0,
        totalTransactions: agentProfileData.statistics.totalTransactions || 0,
        performance: agentProfileData.statistics.performance || '0%',
        activeFarmers: agentProfileData.statistics.activeFarmers || 0,
        territoryUtilization: agentProfileData.statistics.territoryUtilization || '0%'
      };
    } else {
      // Legacy flat structure support
      if (agentProfileData.farmersAssisted !== undefined) profileData.farmersAssisted = agentProfileData.farmersAssisted;
      if (agentProfileData.totalTransactions !== undefined) profileData.totalTransactions = agentProfileData.totalTransactions;
      if (agentProfileData.performance) profileData.performance = agentProfileData.performance;
    }

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
    
    sendSuccess(res, agentData, 'Agent territory updated successfully');
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
    
    // Check if statistics object is provided (new format)
    if (req.body.statistics) {
      const { farmersAssisted, totalTransactions, performance, activeFarmers, territoryUtilization } = req.body.statistics;
      
      updateData.statistics = {};
      if (farmersAssisted !== undefined) updateData.statistics.farmersAssisted = farmersAssisted;
      if (totalTransactions !== undefined) updateData.statistics.totalTransactions = totalTransactions;
      if (performance) updateData.statistics.performance = performance;
      if (activeFarmers !== undefined) updateData.statistics.activeFarmers = activeFarmers;
      if (territoryUtilization) updateData.statistics.territoryUtilization = territoryUtilization;
      
      // Also update legacy fields for backward compatibility
      if (farmersAssisted !== undefined) updateData.farmersAssisted = farmersAssisted;
      if (totalTransactions !== undefined) updateData.totalTransactions = totalTransactions;
      if (performance) updateData.performance = performance;
    } else {
      // Legacy format - individual fields at root level
      const { farmersAssisted, totalTransactions, performance, activeFarmers, territoryUtilization } = req.body;
      
      if (farmersAssisted !== undefined || totalTransactions !== undefined || performance || activeFarmers !== undefined || territoryUtilization) {
        updateData.statistics = {};
        if (farmersAssisted !== undefined) updateData.statistics.farmersAssisted = farmersAssisted;
        if (totalTransactions !== undefined) updateData.statistics.totalTransactions = totalTransactions;
        if (performance) updateData.statistics.performance = performance;
        if (activeFarmers !== undefined) updateData.statistics.activeFarmers = activeFarmers;
        if (territoryUtilization) updateData.statistics.territoryUtilization = territoryUtilization;
        
        // Also update legacy fields for backward compatibility
        if (farmersAssisted !== undefined) updateData.farmersAssisted = farmersAssisted;
        if (totalTransactions !== undefined) updateData.totalTransactions = totalTransactions;
        if (performance) updateData.performance = performance;
      }
    }

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

/**
 * @route   POST /api/agent-information/admin/create
 * @desc    Create agent profile with full territory (Admin only)
 * @access  Private (Admin only)
 */
router.post('/admin/create', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, agent_profile } = req.body;
    
    if (!userId) {
      sendError(res, 'userId is required', 400);
      return;
    }

    // Get target user
    const user = await User.findById(userId);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    if (user.role !== 'agent') {
      sendError(res, 'User must have agent role', 400);
      return;
    }

    // Check if profile already exists
    const existingProfile = await AgentProfile.findOne({ user_id: userId });
    if (existingProfile) {
      sendError(res, 'Agent profile already exists for this user', 400);
      return;
    }

    // Generate next agent ID
    const nextAgentId = await (AgentProfile as any).getNextAgentId();

    const profileDataToCreate = agent_profile || req.body;
    
    // Validate territory if provided
    if (profileDataToCreate.territory) {
      if (!Array.isArray(profileDataToCreate.territory) || profileDataToCreate.territory.length === 0) {
        sendError(res, 'Territory must be a non-empty array', 400);
        return;
      }
      
      if (profileDataToCreate.territory.length > 10) {
        sendError(res, 'Maximum 10 sectors allowed in territory', 400);
        return;
      }
      
      const hasPrimary = profileDataToCreate.territory.some((t: any) => t.isPrimary === true);
      if (!hasPrimary) {
        sendError(res, 'At least one sector must be marked as primary (isPrimary: true)', 400);
        return;
      }
    }

    // Create new agent profile
    const profileData: any = {
      user_id: userId,
      agentId: nextAgentId
    };
    
    // Add all fields from request
    if (profileDataToCreate.province) profileData.province = profileDataToCreate.province;
    if (profileDataToCreate.territory) {
      profileData.territory = profileDataToCreate.territory.map((t: any) => ({
        district: t.district,
        sector: t.sector,
        isPrimary: t.isPrimary || false,
        assignedDate: t.assignedDate || new Date()
      }));
    }
    if (profileDataToCreate.district) profileData.district = profileDataToCreate.district;
    if (profileDataToCreate.sector) profileData.sector = profileDataToCreate.sector;
    if (profileDataToCreate.cell) profileData.cell = profileDataToCreate.cell;
    if (profileDataToCreate.village) profileData.village = profileDataToCreate.village;
    if (profileDataToCreate.specialization) profileData.specialization = profileDataToCreate.specialization;
    if (profileDataToCreate.experience) profileData.experience = profileDataToCreate.experience;
    if (profileDataToCreate.certification) profileData.certification = profileDataToCreate.certification;
    if (profileDataToCreate.profileImage) profileData.profileImage = profileDataToCreate.profileImage;
    
    // Handle statistics
    if (profileDataToCreate.statistics) {
      profileData.statistics = profileDataToCreate.statistics;
      // Also set legacy fields
      profileData.farmersAssisted = profileDataToCreate.statistics.farmersAssisted || 0;
      profileData.totalTransactions = profileDataToCreate.statistics.totalTransactions || 0;
      profileData.performance = profileDataToCreate.statistics.performance || '0%';
    } else {
      // Legacy format
      if (profileDataToCreate.farmersAssisted !== undefined) {
        profileData.farmersAssisted = profileDataToCreate.farmersAssisted;
        if (!profileData.statistics) profileData.statistics = {};
        profileData.statistics.farmersAssisted = profileDataToCreate.farmersAssisted;
      }
      if (profileDataToCreate.totalTransactions !== undefined) {
        profileData.totalTransactions = profileDataToCreate.totalTransactions;
        if (!profileData.statistics) profileData.statistics = {};
        profileData.statistics.totalTransactions = profileDataToCreate.totalTransactions;
      }
      if (profileDataToCreate.performance) {
        profileData.performance = profileDataToCreate.performance;
        if (!profileData.statistics) profileData.statistics = {};
        profileData.statistics.performance = profileDataToCreate.performance;
      }
    }

    const newProfile = new AgentProfile(profileData);
    const savedProfile = await newProfile.save();

    // Return full admin view with territory
    const agentData = transformAgentDataForAdminView(user, savedProfile);
    
    sendCreated(res, agentData, 'Profile created successfully');
  } catch (error: any) {
    console.error('Admin create agent profile error:', error);
    sendError(res, 'Failed to create agent profile', 500);
  }
}));

/**
 * @route   GET /api/agent-information/admin/:userId
 * @desc    Get agent profile with full territory details (Admin only)
 * @access  Private (Admin only)
 */
router.get('/admin/:userId', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Get user
    const user = await User.findById(userId).select('-password -__v');
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    if (user.role !== 'agent') {
      sendError(res, 'User is not an agent', 400);
      return;
    }

    // Get agent profile
    const profile = await AgentProfile.findOne({ user_id: userId });

    // Return full admin view with territory
    const agentData = transformAgentDataForAdminView(user, profile);
    
    sendSuccess(res, agentData, 'Profile retrieved successfully');
  } catch (error: any) {
    console.error('Admin get agent profile error:', error);
    sendError(res, 'Failed to retrieve agent profile', 500);
  }
}));

export default router;
