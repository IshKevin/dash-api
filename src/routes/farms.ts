import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import Farm from '../models/Farm';

const router = Router();

/**
 * @route   GET /api/farms
 * @desc    Get all farms with pagination and filters
 * @access  Private (Admin, Agent)
 */
router.get('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            crop_type, 
            province, 
            district, 
            sector, 
            status 
        } = req.query;

        const query: any = {};
        
        if (crop_type) query.crop_type = crop_type;
        if (province) query['location.province'] = province;
        if (district) query['location.district'] = district;
        if (sector) query['location.sector'] = sector;
        if (status) query.status = status;

        const farms = await Farm.find(query)
            .populate('farmer_id', 'full_name email phone')
            .sort({ created_at: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Farm.countDocuments(query);

        return sendPaginatedResponse(res, farms, total, Number(page), Number(limit), 'Farms retrieved successfully');
    } catch (error: any) {
        console.error('Get farms error:', error);
        return sendError(res, 'Failed to retrieve farms', 500);
    }
}));

/**
 * @route   GET /api/farms/:id
 * @desc    Get farm by ID
 * @access  Private (Admin, Agent, Farmer - own farm)
 */
router.get('/:id', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const farm = await Farm.findById(req.params.id)
            .populate('farmer_id', 'full_name email phone');
        
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        // If user is a farmer, ensure they can only access their own farm
        if (req.user?.role === 'farmer' && farm.farmer_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        return sendSuccess(res, farm, 'Farm retrieved successfully');
    } catch (error: any) {
        console.error('Get farm error:', error);
        return sendError(res, 'Failed to retrieve farm', 500);
    }
}));

/**
 * @route   GET /api/farms/:id/details
 * @desc    Get detailed farm information
 * @access  Private (Admin, Agent, Farmer - own farm)
 */
router.get('/:id/details', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const farm = await Farm.findById(req.params.id)
            .populate('farmer_id', 'full_name email phone');
        
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        // If user is a farmer, ensure they can only access their own farm
        if (req.user?.role === 'farmer' && farm.farmer_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        // Get additional details
        const harvestSchedule = farm.getHarvestSchedule();
        const productionStats = farm.getProductionStats();

        const detailedFarm = {
            ...farm.toObject(),
            harvest_schedule: harvestSchedule,
            production_stats: productionStats,
            is_harvest_ready: farm.isHarvestReady()
        };

        return sendSuccess(res, detailedFarm, 'Detailed farm information retrieved successfully');
    } catch (error: any) {
        console.error('Get farm details error:', error);
        return sendError(res, 'Failed to retrieve farm details', 500);
    }
}));

/**
 * @route   GET /api/farms/:id/harvest-schedule
 * @desc    Get farm harvest schedule
 * @access  Private (Admin, Agent, Farmer - own farm)
 */
router.get('/:id/harvest-schedule', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const farm = await Farm.findById(req.params.id);
        
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        // If user is a farmer, ensure they can only access their own farm
        if (req.user?.role === 'farmer' && farm.farmer_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        const harvestSchedule = farm.getHarvestSchedule();
        const estimatedYield = `${(farm.tree_count * 0.01).toFixed(1)} tons`;

        const response = {
            farm_id: farm._id,
            farm_name: farm.farmName,
            next_harvest: farm.expected_harvest,
            estimated_yield: estimatedYield,
            harvest_windows: harvestSchedule
        };

        return sendSuccess(res, response, 'Farm harvest schedule retrieved successfully');
    } catch (error: any) {
        console.error('Get farm harvest schedule error:', error);
        return sendError(res, 'Failed to retrieve farm harvest schedule', 500);
    }
}));

/**
 * @route   POST /api/farms/:id/purchase-orders
 * @desc    Create purchase order from farm
 * @access  Private (Admin, Agent)
 */
router.post('/:id/purchase-orders', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const farm = await Farm.findById(req.params.id);
        
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        const { quantity, variety, price_per_kg, delivery_date, buyer_info } = req.body;

        // Create a purchase order (simplified - in reality this would be more complex)
        const purchaseOrder = {
            farm_id: farm._id,
            farm_name: farm.farmName,
            farmer_id: farm.farmer_id,
            quantity,
            variety,
            price_per_kg,
            total_amount: quantity * price_per_kg,
            delivery_date: new Date(delivery_date),
            buyer_info,
            status: 'pending',
            created_by: req.user?.id,
            created_at: new Date()
        };

        // In a real implementation, you would save this to a PurchaseOrder model
        return sendSuccess(res, purchaseOrder, 'Purchase order created successfully', 201);
    } catch (error: any) {
        console.error('Create purchase order error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to create purchase order', 500);
    }
}));

/**
 * @route   GET /api/farms/by-location
 * @desc    Get farms by location
 * @access  Private (Admin, Agent)
 */
router.get('/by-location', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { province, district, sector } = req.query;

        if (!province) {
            return sendError(res, 'Province parameter is required', 400);
        }

        const farms = await Farm.findByLocation(
            province as string, 
            district as string, 
            sector as string
        );

        return sendSuccess(res, farms, 'Farms by location retrieved successfully');
    } catch (error: any) {
        console.error('Get farms by location error:', error);
        return sendError(res, 'Failed to retrieve farms by location', 500);
    }
}));

/**
 * @route   GET /api/farms/harvest-ready
 * @desc    Get farms ready for harvest
 * @access  Private (Admin, Agent)
 */
router.get('/harvest-ready', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { variety, date_range } = req.query;

        const farms = await Farm.findHarvestReady(variety as string);

        // Filter by date range if provided
        let filteredFarms = farms;
        if (date_range) {
            const [startDate, endDate] = (date_range as string).split(',');
            filteredFarms = farms.filter((farm: any) => {
                if (!farm.expected_harvest) return false;
                const harvestDate = new Date(farm.expected_harvest);
                return harvestDate >= new Date(startDate!) && harvestDate <= new Date(endDate!);
            });
        }

        return sendSuccess(res, filteredFarms, 'Harvest-ready farms retrieved successfully');
    } catch (error: any) {
        console.error('Get harvest-ready farms error:', error);
        return sendError(res, 'Failed to retrieve harvest-ready farms', 500);
    }
}));

/**
 * @route   GET /api/farms/:id/production-stats
 * @desc    Get farm production statistics
 * @access  Private (Admin, Agent, Farmer - own farm)
 */
router.get('/:id/production-stats', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { period = '30d' } = req.query;
        
        const farm = await Farm.findById(req.params.id);
        
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        // If user is a farmer, ensure they can only access their own farm
        if (req.user?.role === 'farmer' && farm.farmer_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        const productionStats = farm.getProductionStats(period as string);

        return sendSuccess(res, productionStats, 'Farm production statistics retrieved successfully');
    } catch (error: any) {
        console.error('Get farm production stats error:', error);
        return sendError(res, 'Failed to retrieve farm production statistics', 500);
    }
}));

/**
 * @route   GET /api/farms/overview
 * @desc    Get farms overview/summary
 * @access  Private (Admin, Agent)
 */
router.get('/overview', authenticate, authorize('admin', 'agent'), asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const overview = await Farm.getOverview();

        return sendSuccess(res, overview, 'Farms overview retrieved successfully');
    } catch (error: any) {
        console.error('Get farms overview error:', error);
        return sendError(res, 'Failed to retrieve farms overview', 500);
    }
}));

/**
 * @route   POST /api/farms
 * @desc    Create new farm
 * @access  Private (Admin, Agent)
 */
router.post('/', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const farmData = req.body;

        const farm = new Farm(farmData);
        await farm.save();
        
        await farm.populate('farmer_id', 'full_name email phone');

        return sendSuccess(res, farm, 'Farm created successfully', 201);
    } catch (error: any) {
        console.error('Create farm error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to create farm', 500);
    }
}));

/**
 * @route   PUT /api/farms/:id
 * @desc    Update farm
 * @access  Private (Admin, Agent, Farmer - own farm)
 */
router.put('/:id', authenticate, authorize('admin', 'agent', 'farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const farm = await Farm.findById(req.params.id);
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        // If user is a farmer, ensure they can only update their own farm
        if (req.user?.role === 'farmer' && farm.farmer_id.toString() !== req.user.id) {
            return sendError(res, 'Access denied', 403);
        }

        const updatedFarm = await Farm.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('farmer_id', 'full_name email phone');

        return sendSuccess(res, updatedFarm, 'Farm updated successfully');
    } catch (error: any) {
        console.error('Update farm error:', error);
        if (error.name === 'ValidationError') {
            return sendError(res, error.message, 400);
        }
        return sendError(res, 'Failed to update farm', 500);
    }
}));

/**
 * @route   DELETE /api/farms/:id
 * @desc    Delete farm
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
        const farm = await Farm.findById(req.params.id);
        if (!farm) {
            return sendError(res, 'Farm not found', 404);
        }

        await Farm.findByIdAndDelete(req.params.id);
        return sendSuccess(res, null, 'Farm deleted successfully');
    } catch (error: any) {
        console.error('Delete farm error:', error);
        return sendError(res, 'Failed to delete farm', 500);
    }
}));

export default router;