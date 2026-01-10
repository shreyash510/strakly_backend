import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import {
  CreatePostDto,
  UpdatePostDto,
  AddReactionDto,
  AddCommentDto,
  PostCategory,
} from './dto/create-post.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get feed (own + friends' posts)
  @Get()
  getFeed(
    @Headers('x-user-id') userId: string,
    @Query('category') category?: PostCategory,
  ) {
    if (category) {
      return this.postsService.getPostsByCategory(
        this.getUserId(userId),
        category,
      );
    }
    return this.postsService.getFeed(this.getUserId(userId));
  }

  // Get my posts
  @Get('my')
  getMyPosts(@Headers('x-user-id') userId: string) {
    return this.postsService.getMyPosts(this.getUserId(userId));
  }

  // Get single post
  @Get(':id')
  getPost(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.postsService.getPost(this.getUserId(userId), id);
  }

  // Create new post
  @Post()
  createPost(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.createPost(this.getUserId(userId), dto);
  }

  // Update post
  @Patch(':id')
  updatePost(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.updatePost(this.getUserId(userId), id, dto);
  }

  // Delete post
  @Delete(':id')
  deletePost(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.postsService.deletePost(this.getUserId(userId), id);
  }

  // Toggle reaction
  @Post('reaction')
  toggleReaction(
    @Headers('x-user-id') userId: string,
    @Body() dto: AddReactionDto,
  ) {
    return this.postsService.toggleReaction(
      this.getUserId(userId),
      dto.postId,
      dto.type,
    );
  }

  // Add comment
  @Post('comment')
  addComment(
    @Headers('x-user-id') userId: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.postsService.addComment(
      this.getUserId(userId),
      dto.postId,
      dto.content,
    );
  }

  // Delete comment
  @Delete(':postId/comment/:commentId')
  deleteComment(
    @Headers('x-user-id') userId: string,
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.postsService.deleteComment(
      this.getUserId(userId),
      postId,
      commentId,
    );
  }
}
