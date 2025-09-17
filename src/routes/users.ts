import { Router, Response } from 'express';
import { User } from '../models/User';
import { 
  validateIdParam, 
  validateUserProfileUpdate,
  validatePagination,
  validateFarmerProfile
} from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize, adminOnly, simpleAuth, simpleAdminOnly } from '../middleware/auth';
import { sendSuccess, sendPaginatedResponse, sendNotFound, sendError } from '../utils/responses';
import { UpdateUserRequest, UserRole, UserStatus } from '../types/user';
import { AuthenticatedRequest } from '../types/auth';

const router = Router();

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private (Admin only)
 */
router.get('/', simpleAuth, simpleAdminOnly, validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object
    const filter: any = {};
    
    // Add role filter if provided
    if (req.query.role) {
      filter.role = req.query.role;
    }
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add search filter if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, 'i');
      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
      ];
    }
    
    // Get users with pagination
    const users = await User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    // Transform users to public JSON
    const userData = users.map(user => user.toPublicJSON());
    
    sendPaginatedResponse(res, userData, total, page, limit, 'Users retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve users', 500);
    return;
  }
}));

/**
 * @route   GET /api/users/farmers
 * @desc    Get all farmers (admin and agents only)
 * @access  Private (Admin and agents)
 */
router.get('/farmers', authenticate, authorize('admin', 'agent'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter for farmers
    const filter: any = { role: 'farmer' };
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add search filter if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, 'i');
      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
      ];
    }
    
    // Get farmers with pagination
    const farmers = await User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    // Transform farmers to public JSON
    const farmerData = farmers.map(user => user.toPublicJSON());
    
    sendPaginatedResponse(res, farmerData, total, page, limit, 'Farmers retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve farmers', 500);
    return;
  }
}));

/**
 * @route   POST /api/users/farmers
 * @desc    Create new farmer (admin only)
 * @access  Private (Admin only)
 */
router.post('/farmers', authenticate, adminOnly, validateFarmerProfile, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      full_name,
      email,
      age,
      phone,
      gender,
      marital_status,
      education_level,
      // Personal location
      province,
      district,
      sector,
      cell,
      village,
      // Farm location
      farm_province,
      farm_district,
      farm_sector,
      farm_cell,
      farm_village,
      // Farm details
      farm_age,
      planted,
      avocado_type,
      mixed_percentage,
      farm_size,
      tree_count,
      upi_number,
      assistance
    } = req.body;
    
    // Validate required fields
    if (!full_name || !email || !gender) {
      sendError(res, 'Full name, email, and gender are required', 400);
      return;
    }
    
    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      sendError(res, 'User with this email already exists', 400);
      return;
    }
    
    // Create farmer with default password
    const defaultPassword = 'FarmerPass123!';
    
    const farmerData = {
      email: email.toLowerCase().trim(),
      password: defaultPassword,
      full_name: full_name.trim(),
      phone: phone?.trim() || undefined,
      role: 'farmer' as UserRole,
      status: 'active' as UserStatus,
      profile: {
        age: age || undefined,
        gender: gender,
        marital_status: marital_status || undefined,
        education_level: education_level || undefined,
        // Personal location
        province: province?.trim() || undefined,
        district: district?.trim() || undefined,
        sector: sector?.trim() || undefined,
        cell: cell?.trim() || undefined,
        village: village?.trim() || undefined,
        // Farm details
        farm_details: {
          farm_location: {
            province: farm_province?.trim() || undefined,
            district: farm_district?.trim() || undefined,
            sector: farm_sector?.trim() || undefined,
            cell: farm_cell?.trim() || undefined,
            village: farm_village?.trim() || undefined,
          },
          farm_age: farm_age || undefined,
          planted: planted || undefined,
          avocado_type: avocado_type || undefined,
          mixed_percentage: mixed_percentage || undefined,
          farm_size: farm_size || undefined,
          tree_count: tree_count || undefined,
          upi_number: upi_number?.trim() || undefined,
          assistance: assistance || undefined
        }
      }
    };
    
    // Create new farmer
    const farmer = new User(farmerData);
    await farmer.save();
    
    // Return success response with farmer data (excluding password)
    sendSuccess(res, {
      ...farmer.toPublicJSON(),
      default_password: defaultPassword // Include default password in response for admin
    }, 'Farmer created successfully');
    return;
    
  } catch (error: any) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map((err: any) => err.message);
      sendError(res, `Validation error: ${validationErrors.join(', ')}`, 400);
      return;
    }
    
    // Handle duplicate email error
    if (error.code === 11000 && error.keyPattern?.email) {
      sendError(res, 'User with this email already exists', 400);
      return;
    }
    
    console.error('Error creating farmer:', error);
    sendError(res, 'Failed to create farmer', 500);
    return;
  }
}));

/**
 * @route   GET /api/users/agents
 * @desc    Get all agents (admin only)
 * @access  Private (Admin only)
 */
router.get('/agents', authenticate, authorize('admin'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter for agents
    const filter: any = { role: 'agent' };
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add search filter if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, 'i');
      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
      ];
    }
    
    // Get agents with pagination
    const agents = await User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    // Transform agents to public JSON
    const agentData = agents.map(user => user.toPublicJSON());
    
    sendPaginatedResponse(res, agentData, total, page, limit, 'Agents retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve agents', 500);
    return;
  }
}));

/**
 * @route   GET /api/users/shop-managers
 * @desc    Get all shop managers (admin only)
 * @access  Private (Admin only)
 */
router.get('/shop-managers', authenticate, authorize('admin'), validatePagination, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter for shop managers
    const filter: any = { role: 'shop_manager' };
    
    // Add status filter if provided
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    // Add search filter if provided
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, 'i');
      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
      ];
    }
    
    // Get shop managers with pagination
    const shopManagers = await User.find(filter)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    // Transform shop managers to public JSON
    const shopManagerData = shopManagers.map(user => user.toPublicJSON());
    
    sendPaginatedResponse(res, shopManagerData, total, page, limit, 'Shop managers retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve shop managers', 500);
    return;
  }
}));

// IMPORTANT: All specific routes (like /agents, /farmers) must come BEFORE parameterized routes (like /:id)

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id).select('-password');
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    sendSuccess(res, user.toPublicJSON(), 'Profile retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve profile', 500);
    return;
  }
}));

/**
 * @route   PUT /api/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', authenticate, validateFarmerProfile, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const updateData = req.body;
    
    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updateData.role;
    delete updateData.status;
    delete updateData.password;
    delete updateData.email; // Email changes should go through a separate verification process
    
    // Structure the profile data correctly
    if (req.user?.role === 'farmer') {
      const profileData = {
        full_name: updateData.full_name,
        phone: updateData.phone,
        profile: {
          age: updateData.age,
          gender: updateData.gender,
          marital_status: updateData.marital_status,
          education_level: updateData.education_level,
          // Personal location
          province: updateData.province,
          district: updateData.district,
          sector: updateData.sector,
          cell: updateData.cell,
          village: updateData.village,
          // Farm details
          farm_details: {
            farm_location: {
              province: updateData.farm_province,
              district: updateData.farm_district,
              sector: updateData.farm_sector,
              cell: updateData.farm_cell,
              village: updateData.farm_village,
            },
            farm_age: updateData.farm_age,
            planted: updateData.planted,
            avocado_type: updateData.avocado_type,
            mixed_percentage: updateData.mixed_percentage,
            farm_size: updateData.farm_size,
            tree_count: updateData.tree_count,
            upi_number: updateData.upi_number,
            assistance: updateData.assistance
          }
        }
      };
      
      const user = await User.findByIdAndUpdate(
        userId,
        profileData,
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!user) {
        sendNotFound(res, 'User not found');
        return;
      }

      sendSuccess(res, user.toPublicJSON(), 'Profile updated successfully');
      return;
    } else {
      // For non-farmer users, update basic profile
      const user = await User.findByIdAndUpdate(
        userId,
        {
          full_name: updateData.full_name,
          phone: updateData.phone,
          profile: {
            ...updateData.profile
          }
        },
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!user) {
        sendNotFound(res, 'User not found');
        return;
      }

      sendSuccess(res, user.toPublicJSON(), 'Profile updated successfully');
      return;
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    sendError(res, 'Failed to update profile', 500);
    return;
  }
}));

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin or self)
 */
router.get('/:id', simpleAuth, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.id;
    
    // With simplified auth, any token holder can access any user
    const user = await User.findById(userId).select('-password');
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    sendSuccess(res, user.toPublicJSON(), 'User retrieved successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to retrieve user', 500);
    return;
  }
}));

/**
 * @route   PUT /api/users/:id
 * @desc    Update user (admin or self)
 * @access  Private (Admin or self)
 */
router.put('/:id', authenticate, validateIdParam, validateUserProfileUpdate, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const updateData: UpdateUserRequest = req.body;
    
    // Check permissions
    if (req.user?.id !== userId && req.user?.role !== 'admin') {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    // Prevent role/status changes by non-admin users
    if (req.user?.role !== 'admin') {
      delete updateData.role;
      delete updateData.status;
    }
    
    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    sendSuccess(res, user.toPublicJSON(), 'User updated successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to update user', 500);
    return;
  }
}));

/**
 * @route   POST /api/users/agents
 * @desc    Create new agent (admin only)
 * @access  Private (Admin only)
 */
router.post('/agents', authenticate, adminOnly, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { full_name, email, phone, province, district, sector } = req.body;
    
    // Validate required fields
    if (!full_name || !email) {
      sendError(res, 'Full name and email are required', 400);
      return;
    }
    
    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      sendError(res, 'User with this email already exists', 400);
      return;
    }
    
    // Create agent with default password
    const defaultPassword = 'AgentPass123!'; // You can customize this default password
    
    const agentData = {
      email: email.toLowerCase().trim(),
      password: defaultPassword,
      full_name: full_name.trim(),
      phone: phone?.trim() || undefined,
      role: 'agent' as UserRole,
      status: 'active' as UserStatus,
      profile: {
        province: province?.trim() || undefined,
        district: district?.trim() || undefined,
        ...(sector && { service_areas: [sector.trim()] }) // Using service_areas for agent's sector
      }
    };
    
    // Create new agent
    const agent = new User(agentData);
    await agent.save();
    
    // Return success response with agent data (excluding password)
    sendSuccess(res, {
      ...agent.toPublicJSON(),
      default_password: defaultPassword // Include default password in response for admin
    }, 'Agent created successfully');
    return;
    
  } catch (error: any) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map((err: any) => err.message);
      sendError(res, `Validation error: ${validationErrors.join(', ')}`, 400);
      return;
    }
    
    // Handle duplicate email error
    if (error.code === 11000 && error.keyPattern?.email) {
      sendError(res, 'User with this email already exists', 400);
      return;
    }
    
    console.error('Error creating agent:', error);
    sendError(res, 'Failed to create agent', 500);
    return;
  }
}));

/**
 * @route   PUT /api/users/:id/status
 * @desc    Update user status (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/status', authenticate, adminOnly, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { status } = req.body;
    
    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      sendError(res, 'Invalid status value', 400);
      return;
    }
    
    // Update user status
    const user = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    sendSuccess(res, user.toPublicJSON(), `User status updated to ${status}`);
    return;
  } catch (error) {
    sendError(res, 'Failed to update user status', 500);
    return;
  }
}));

/**
 * @route   PUT /api/users/:id/role
 * @desc    Update user role (admin only)
 * @access  Private (Admin only)
 */
router.put('/:id/role', authenticate, adminOnly, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;
    
    // Validate role
    const validRoles = ['admin', 'agent', 'farmer', 'shop_manager'];
    if (!validRoles.includes(role)) {
      sendError(res, 'Invalid role value', 400);
      return;
    }
    
    // Prevent changing the role of the last admin
    if (role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin', status: 'active' });
      const user = await User.findById(userId);
      
      if (user?.role === 'admin' && adminCount <= 1) {
        sendError(res, 'Cannot remove the last admin user', 400);
        return;
      }
    }
    
    // Update user role
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    sendSuccess(res, user.toPublicJSON(), `User role updated to ${role}`);
    return;
  } catch (error) {
    sendError(res, 'Failed to update user role', 500);
    return;
  }
}));

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (admin only)
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, adminOnly, validateIdParam, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.id;
    
    // Prevent users from deleting themselves
    if (req.user?.id === userId) {
      sendError(res, 'Cannot delete your own account', 400);
      return;
    }
    
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      sendNotFound(res, 'User not found');
      return;
    }

    sendSuccess(res, null, 'User deleted successfully');
    return;
  } catch (error) {
    sendError(res, 'Failed to delete user', 500);
    return;
  }
}));

export default router;