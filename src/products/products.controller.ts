import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  AdjustStockDto,
  CreateProductSaleDto,
  CreateBatchSaleDto,
  ProductFiltersDto,
  SalesFiltersDto,
  SalesStatsFiltersDto,
  StockMovementFiltersDto,
  SalesTrendFiltersDto,
  AllStockMovementsFiltersDto,
  BatchStockAdjustDto,
  StockTakeFiltersDto,
  UpdateStockTakeItemDto,
  CompleteStockTakeDto,
  StartStockTakeDto,
} from './dto/products.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
/* PlanFeaturesGuard removed – products/POS must work for ALL plans */
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
/* PlanFeatures decorator removed – no longer needed here */
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
/* PLAN_FEATURES import removed – no longer needed here */
import { setPaginationHeaders } from '../common/pagination.util';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard, ManagerPermissionsGuard)
/* @PlanFeatures(PLAN_FEATURES.POS_RETAIL) removed – products available for all plans */
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ─── Categories ───

  @Get('categories')
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'List all product categories' })
  findAllCategories(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.productsService.findAllCategories(gymId, branchId);
  }

  @Post('categories')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create product category' })
  createCategory(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.productsService.createCategory(gymId, branchId, dto);
  }

  @Patch('categories/:id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update product category' })
  @ApiParam({ name: 'id', type: Number })
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.productsService.updateCategory(id, gymId, dto);
  }

  @Delete('categories/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete product category' })
  @ApiParam({ name: 'id', type: Number })
  removeCategory(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.softDeleteCategory(id, gymId);
  }

  // ─── Sales (before :id to avoid route conflicts) ───

  @Get('sales')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List all product sales' })
  findAllSales(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: SalesFiltersDto,
  ) {
    return this.productsService.findAllSales(gymId, branchId, filters);
  }

  @Get('sales/stats')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get sales statistics' })
  getSalesStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: SalesStatsFiltersDto,
  ) {
    return this.productsService.getSalesStats(gymId, branchId, filters);
  }

  @Get('sales/stats/trend')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get sales trend data grouped by period' })
  getSalesStatsTrend(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: SalesTrendFiltersDto,
  ) {
    return this.productsService.getSalesStatsTrend(gymId, branchId, filters);
  }

  @Get('sales/:id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get sale by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOneSale(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.findOneSale(id, gymId);
  }

  @Get('sales/:id/receipt')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get sale receipt with gym info and all items' })
  @ApiParam({ name: 'id', type: Number })
  getSaleReceipt(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.getSaleReceipt(id, gymId);
  }

  @Post('sales')
  @Roles('admin', 'manager', 'trainer')
  @ManagerPermission('products', 'create')
  @ApiOperation({ summary: 'Record a product sale' })
  createSale(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @Body() dto: CreateProductSaleDto,
  ) {
    return this.productsService.createSale(gymId, branchId, dto, userId);
  }

  @Post('sales/batch')
  @Roles('admin', 'manager', 'trainer')
  @ManagerPermission('products', 'create')
  @ApiOperation({ summary: 'Record a batch sale (multiple products)' })
  createBatchSale(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @Body() dto: CreateBatchSaleDto,
  ) {
    return this.productsService.createBatchSale(gymId, branchId, dto, userId);
  }

  /* ─── Cross-product Stock Movements ─── */

  @Get('inventory/movements')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List stock movements across all products' })
  async getAllStockMovements(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: AllStockMovementsFiltersDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.productsService.getAllStockMovements(gymId, branchId, filters);
    const total = result.total;
    const page = result.page;
    const limit = result.limit;
    setPaginationHeaders(res, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
    return result.data;
  }

  // ─── Products ───

  @Get()
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'List all products' })
  async findAllProducts(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: ProductFiltersDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.productsService.findAllProducts(gymId, branchId, filters);
    /* Set standard pagination headers */
    const total = result.total;
    const page = result.page;
    const limit = result.limit;
    setPaginationHeaders(res, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
    return result.data;
  }

  @Get('low-stock')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get products with low stock' })
  findLowStockProducts(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.productsService.findLowStockProducts(gymId, branchId);
  }

  @Get('barcode/:barcode')
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Look up a product by barcode' })
  @ApiParam({ name: 'barcode', type: String })
  findByBarcode(
    @Param('barcode') barcode: string,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.productsService.findByBarcode(gymId, branchId, barcode);
  }

  @Get('inventory/stats')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get inventory valuation and stock stats' })
  getInventoryStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.productsService.getInventoryStats(gymId, branchId);
  }

  /* ─── Batch Stock Adjustment ─── */

  @Post('inventory/batch-adjust')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'update')
  @ApiOperation({ summary: 'Batch adjust stock for multiple products' })
  batchStockAdjust(
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: BatchStockAdjustDto,
  ) {
    return this.productsService.batchStockAdjust(gymId, dto, userId);
  }

  /* ─── Reorder Suggestions ─── */

  @Get('inventory/reorder-suggestions')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get reorder suggestions based on sales velocity' })
  getReorderSuggestions(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.productsService.getReorderSuggestions(gymId, branchId);
  }

  /* ─── Dead Stock ─── */

  @Get('inventory/dead-stock')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get dead stock products with no recent sales' })
  getDeadStock(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query('days') days?: string,
  ) {
    return this.productsService.getDeadStock(gymId, branchId, days ? parseInt(days) : 30);
  }

  /* ─── Stock Take (Physical Count) ─── */

  @Post('inventory/stock-takes')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'create')
  @ApiOperation({ summary: 'Start a new stock take session' })
  startStockTake(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @Body() dto: StartStockTakeDto,
  ) {
    return this.productsService.startStockTake(gymId, branchId, userId, dto);
  }

  @Get('inventory/stock-takes')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List stock take sessions' })
  getStockTakes(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: StockTakeFiltersDto,
  ) {
    return this.productsService.getStockTakes(gymId, branchId, filters);
  }

  @Get('inventory/stock-takes/:id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get stock take details with all items' })
  @ApiParam({ name: 'id', type: Number })
  getStockTake(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.getStockTake(gymId, id);
  }

  @Patch('inventory/stock-takes/:id/items/:itemId')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'update')
  @ApiOperation({ summary: 'Record physical count for a stock take item' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'itemId', type: Number })
  updateStockTakeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @GymId() gymId: number,
    @Body() dto: UpdateStockTakeItemDto,
  ) {
    return this.productsService.updateStockTakeItem(gymId, id, itemId, dto);
  }

  @Post('inventory/stock-takes/:id/complete')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'update')
  @ApiOperation({ summary: 'Complete a stock take and optionally apply adjustments' })
  @ApiParam({ name: 'id', type: Number })
  completeStockTake(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: CompleteStockTakeDto,
  ) {
    return this.productsService.completeStockTake(gymId, id, userId, dto);
  }

  @Get(':id')
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOneProduct(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.findOneProduct(id, gymId);
  }

  @Post()
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'create')
  @ApiOperation({ summary: 'Create a product' })
  createProduct(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(gymId, branchId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'update')
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({ name: 'id', type: Number })
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, gymId, dto);
  }

  @Patch(':id/stock')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'update')
  @ApiOperation({ summary: 'Adjust product stock' })
  @ApiParam({ name: 'id', type: Number })
  adjustStock(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(id, gymId, dto, userId);
  }

  @Get(':id/stock-movements')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get stock movements for a product' })
  @ApiParam({ name: 'id', type: Number })
  getStockMovements(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: StockMovementFiltersDto,
  ) {
    return this.productsService.getStockMovements(gymId, id, branchId, filters);
  }

  @Delete(':id')
  @Roles('admin')
  @ManagerPermission('products', 'delete')
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'id', type: Number })
  removeProduct(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.softDeleteProduct(id, gymId);
  }
}
