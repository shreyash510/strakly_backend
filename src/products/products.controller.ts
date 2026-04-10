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
  Request,
  Req,
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
  AllStockMovementsFiltersDto,
  BatchStockAdjustDto,
  StockTakeFiltersDto,
  UpdateStockTakeItemDto,
  CompleteStockTakeDto,
  StartStockTakeDto,
} from './dto/products.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';
import { setPaginationHeaders } from '../common/pagination.util';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard, ManagerPermissionsGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ─── Categories ───

  @Get('categories')
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'List all product categories' })
  findAllCategories(
    @GymId() gymId: number,
  ) {
    return this.productsService.findAllCategories(gymId);
  }

  @Post('categories')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'create')
  @ApiOperation({ summary: 'Create product category' })
  createCategory(
    @GymId() gymId: number,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.productsService.createCategory(gymId, dto);
  }

  @Patch('categories/:id')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'update')
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
  @ManagerPermission('products', 'delete')
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
    @Query() filters: SalesFiltersDto,
  ) {
    return this.productsService.findAllSales(gymId, filters);
  }

  @Get('sales/transactions')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List sales grouped by transaction (paymentId)' })
  findSalesTransactions(
    @GymId() gymId: number,
    @Query() filters: SalesFiltersDto,
  ) {
    return this.productsService.findSalesTransactions(gymId, filters);
  }

  @Get('sales/stats')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get sales statistics' })
  getSalesStats(
    @GymId() gymId: number,
    @Query() filters: SalesStatsFiltersDto,
  ) {
    return this.productsService.getSalesStats(gymId, filters);
  }

  @Post('sales')
  @Roles('admin', 'manager', 'trainer')
  @ManagerPermission('productSales', 'create')
  @ApiOperation({ summary: 'Record a product sale' })
  createSale(
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: CreateProductSaleDto,
  ) {
    return this.productsService.createSale(gymId, dto, userId);
  }

  @Post('sales/batch')
  @Roles('admin', 'manager', 'trainer')
  @ManagerPermission('productSales', 'create')
  @ApiOperation({ summary: 'Record a batch sale (multiple products)' })
  createBatchSale(
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: CreateBatchSaleDto,
  ) {
    return this.productsService.createBatchSale(gymId, dto, userId);
  }

  @Delete('sales/batch/:paymentId')
  @Roles('admin', 'manager')
  @ManagerPermission('productSales', 'delete')
  @ApiOperation({ summary: 'Void all sales in a batch' })
  @ApiParam({ name: 'paymentId', type: Number })
  voidBatchSale(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @GymId() gymId: number,
    @Request() req,
  ) {
    return this.productsService.voidBatchSale(paymentId, gymId, req.user.userId);
  }

  @Delete('sales/:id')
  @Roles('admin', 'manager')
  @ManagerPermission('productSales', 'delete')
  @ApiOperation({ summary: 'Void a product sale' })
  @ApiParam({ name: 'id', type: Number })
  voidSale(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Request() req,
  ) {
    return this.productsService.voidSale(id, gymId, req.user.userId);
  }

  /* ─── Cross-product Stock Movements ─── */

  @Get('inventory/movements')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List stock movements across all products' })
  async getAllStockMovements(
    @GymId() gymId: number,
    @Query() filters: AllStockMovementsFiltersDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.productsService.getAllStockMovements(gymId, filters);
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
    @Query() filters: ProductFiltersDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.productsService.findAllProducts(gymId, filters);
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
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.productsService.findLowStockProducts(gymId, resolveEffectiveBranchId(req.user, branchId) ?? undefined);
  }

  @Get('inventory/stats')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get inventory valuation and stock stats' })
  getInventoryStats(
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.productsService.getInventoryStats(gymId, resolveEffectiveBranchId(req.user, branchId) ?? undefined);
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
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.productsService.getReorderSuggestions(gymId, resolveEffectiveBranchId(req.user, branchId) ?? undefined);
  }

  /* ─── Dead Stock ─── */

  @Get('inventory/dead-stock')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get dead stock products with no recent sales' })
  getDeadStock(
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('days') days?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.productsService.getDeadStock(gymId, days ? parseInt(days) : 30, resolveEffectiveBranchId(req.user, branchId) ?? undefined);
  }

  /* ─── Stock Take (Physical Count) ─── */

  @Post('inventory/stock-takes')
  @Roles('admin', 'manager')
  @ManagerPermission('products', 'create')
  @ApiOperation({ summary: 'Start a new stock take session' })
  startStockTake(
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: StartStockTakeDto,
  ) {
    return this.productsService.startStockTake(gymId, userId, dto);
  }

  @Get('inventory/stock-takes')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List stock take sessions' })
  getStockTakes(
    @GymId() gymId: number,
    @Query() filters: StockTakeFiltersDto,
  ) {
    return this.productsService.getStockTakes(gymId, filters);
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
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(gymId, dto);
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
