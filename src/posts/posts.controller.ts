import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import {
  CreatePostDto,
  UpdatePostDto,
  AddReactionDto,
  AddCommentDto,
  PostCategory,
} from './dto/create-post.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // Get feed (own + friends' posts)
  @Get()
  getFeed(@CurrentUser() user: any, @Query('category') category?: PostCategory) {
    if (category) {
      return this.postsService.getPostsByCategory(user.userId, category);
    }
    return this.postsService.getFeed(user.userId);
  }

  // Get my posts
  @Get('my')
  getMyPosts(@CurrentUser() user: any) {
    return this.postsService.getMyPosts(user.userId);
  }

  // Get single post
  @Get(':id')
  getPost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.getPost(user.userId, id);
  }

  // Create new post
  @Post()
  createPost(@CurrentUser() user: any, @Body() dto: CreatePostDto) {
    return this.postsService.createPost(user.userId, dto);
  }

  // Update post
  @Patch(':id')
  updatePost(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.updatePost(user.userId, id, dto);
  }

  // Delete post
  @Delete(':id')
  deletePost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.deletePost(user.userId, id);
  }

  // Toggle reaction
  @Post('reaction')
  toggleReaction(@CurrentUser() user: any, @Body() dto: AddReactionDto) {
    return this.postsService.toggleReaction(user.userId, dto.postId, dto.type);
  }

  // Add comment
  @Post('comment')
  addComment(@CurrentUser() user: any, @Body() dto: AddCommentDto) {
    return this.postsService.addComment(user.userId, dto.postId, dto.content);
  }

  // Delete comment
  @Delete(':postId/comment/:commentId')
  deleteComment(
    @CurrentUser() user: any,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.postsService.deleteComment(user.userId, postId, commentId);
  }
}
