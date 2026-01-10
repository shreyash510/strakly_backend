import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.tasksService.findAll(this.getUserId(userId));
  }

  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.tasksService.findOne(this.getUserId(userId), id);
  }

  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(this.getUserId(userId), createTaskDto);
  }

  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(this.getUserId(userId), id, updateTaskDto);
  }

  @Patch(':id/toggle')
  toggleStatus(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.tasksService.toggleStatus(this.getUserId(userId), id);
  }

  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.tasksService.remove(this.getUserId(userId), id);
  }
}
