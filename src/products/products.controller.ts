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
} from '@nestjs/common';
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
} from './dto/products.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.POS_RETAIL)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ─── Categories ───

  @Get('categories')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'List all product categories' })
  findAllCategories(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.productsService.findAllCategories(gymId, branchId);
  }

  @Post('categories')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create product category' })
  createCategory(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.productsService.createCategory(gymId, branchId, dto);
  }

  @Patch('categories/:id')
  @Roles('admin', 'branch_admin', 'manager')
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
  @Roles('admin', 'branch_admin')
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
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List all product sales' })
  findAllSales(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: SalesFiltersDto,
  ) {
    return this.productsService.findAllSales(gymId, branchId, filters);
  }

  @Get('sales/stats')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get sales statistics' })
  getSalesStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: SalesStatsFiltersDto,
  ) {
    return this.productsService.getSalesStats(gymId, branchId, filters);
  }

  @Get('sales/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get sale by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOneSale(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.findOneSale(id, gymId);
  }

  @Post('sales')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
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
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Record a batch sale (multiple products)' })
  createBatchSale(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @Body() dto: CreateBatchSaleDto,
  ) {
    return this.productsService.createBatchSale(gymId, branchId, dto, userId);
  }

  // ─── Products ───

  @Get()
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'List all products' })
  findAllProducts(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: ProductFiltersDto,
  ) {
    return this.productsService.findAllProducts(gymId, branchId, filters);
  }

  @Get('low-stock')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get products with low stock' })
  findLowStockProducts(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.productsService.findLowStockProducts(gymId, branchId);
  }

  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOneProduct(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.findOneProduct(id, gymId);
  }

  @Post()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create a product' })
  createProduct(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(gymId, branchId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin', 'manager')
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
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Adjust product stock' })
  @ApiParam({ name: 'id', type: Number })
  adjustStock(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(id, gymId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'id', type: Number })
  removeProduct(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.productsService.softDeleteProduct(id, gymId);
  }
}
