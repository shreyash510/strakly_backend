import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

@Injectable()
export class UploadService {
  private s3Client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    console.log('=== S3 Configuration ===');
    console.log('Endpoint:', process.env.STORAGE_ENDPOINT);
    console.log('Region:', process.env.STORAGE_REGION);
    console.log('Bucket:', process.env.STORAGE_BUCKET);
    console.log('Public URL:', process.env.STORAGE_PUBLIC_URL);
    console.log('Access Key (first 8 chars):', process.env.STORAGE_ACCESS_KEY?.substring(0, 8));
    console.log('========================');

    this.s3Client = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
        secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
      },
      forcePathStyle: true, // Required for Supabase S3
    });
    this.bucket = process.env.STORAGE_BUCKET || 'strakly';
    this.publicUrl = process.env.STORAGE_PUBLIC_URL || '';
  }

  /**
   * Compress image while keeping original format
   */
  private async compressImage(
    buffer: Buffer,
    mimeType: string,
    maxSizeKB = 200,
  ): Promise<{ buffer: Buffer; format: string; contentType: string }> {
    const maxSize = maxSizeKB * 1024;
    let quality = 80;

    // Determine format from mime type
    let format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg';
    let contentType = 'image/jpeg';
    let extension = 'jpg';

    if (mimeType === 'image/png') {
      format = 'png';
      contentType = 'image/png';
      extension = 'png';
    } else if (mimeType === 'image/webp') {
      format = 'webp';
      contentType = 'image/webp';
      extension = 'webp';
    } else if (mimeType === 'image/gif') {
      format = 'gif';
      contentType = 'image/gif';
      extension = 'gif';
    }

    // First attempt with quality 80
    let sharpInstance = sharp(buffer).resize(400, 400, {
      fit: 'cover',
      position: 'center',
    });

    let result: Buffer;
    if (format === 'png') {
      result = await sharpInstance.png({ quality }).toBuffer();
    } else if (format === 'webp') {
      result = await sharpInstance.webp({ quality }).toBuffer();
    } else if (format === 'gif') {
      result = await sharpInstance.gif().toBuffer();
    } else {
      result = await sharpInstance.jpeg({ quality }).toBuffer();
    }

    // Reduce quality until under max size (skip for gif)
    while (result.length > maxSize && quality > 20 && format !== 'gif') {
      quality -= 10;
      sharpInstance = sharp(buffer).resize(400, 400, {
        fit: 'cover',
        position: 'center',
      });

      if (format === 'png') {
        result = await sharpInstance.png({ quality }).toBuffer();
      } else if (format === 'webp') {
        result = await sharpInstance.webp({ quality }).toBuffer();
      } else {
        result = await sharpInstance.jpeg({ quality }).toBuffer();
      }
    }

    // If still too large, resize smaller
    if (result.length > maxSize && format !== 'gif') {
      sharpInstance = sharp(buffer).resize(300, 300, {
        fit: 'cover',
        position: 'center',
      });

      if (format === 'png') {
        result = await sharpInstance.png({ quality: 60 }).toBuffer();
      } else if (format === 'webp') {
        result = await sharpInstance.webp({ quality: 60 }).toBuffer();
      } else {
        result = await sharpInstance.jpeg({ quality: 60 }).toBuffer();
      }
    }

    return { buffer: result, format: extension, contentType };
  }

  /**
   * Upload avatar image for a user
   */
  async uploadAvatar(
    file: Express.Multer.File,
    userId: string | number,
    oldAvatarUrl?: string,
  ): Promise<{ url: string; size: number }> {
    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, WebP, and GIF are allowed.',
      );
    }

    // Delete old avatar if exists
    if (oldAvatarUrl) {
      await this.deleteAvatar(oldAvatarUrl);
    }

    // Compress image while keeping original format
    const compressed = await this.compressImage(file.buffer, file.mimetype);

    // Generate unique filename - store in users/{userId}/profile/ folder
    const timestamp = Date.now();
    const filename = `users/${userId}/profile/${timestamp}.${compressed.format}`;

    // Upload to S3 (Supabase Storage)
    try {
      console.log('Attempting S3 upload:', { bucket: this.bucket, key: filename, contentType: compressed.contentType });
      const result = await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: filename,
          Body: compressed.buffer,
          ContentType: compressed.contentType,
        }),
      );
      console.log('S3 Upload Success:', result);
    } catch (error: any) {
      console.error('=== S3 Upload Error ===');
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Code:', error.Code || error.$metadata?.httpStatusCode);
      console.error('Bucket:', this.bucket);
      console.error('Key:', filename);
      console.error('Full Error:', JSON.stringify(error, null, 2));
      console.error('=======================');
      throw new BadRequestException(`Failed to upload image: ${error.message || 'Unknown error'}`);
    }

    // Return public URL
    const url = `${this.publicUrl}/${filename}`;
    console.log('Uploaded avatar:', { url, size: compressed.buffer.length });

    return {
      url,
      size: compressed.buffer.length,
    };
  }

  /**
   * Delete an avatar from storage
   */
  async deleteAvatar(avatarUrl: string): Promise<void> {
    if (!avatarUrl || !avatarUrl.includes(this.publicUrl)) {
      return; // Not our file or no URL
    }

    try {
      const key = avatarUrl.replace(`${this.publicUrl}/`, '');
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      console.error('Failed to delete avatar:', error);
      // Don't throw - deletion failure shouldn't break the flow
    }
  }

  /**
   * Upload gym logo
   */
  async uploadGymLogo(
    file: Express.Multer.File,
    gymId: string | number,
    oldLogoUrl?: string,
  ): Promise<{ url: string; size: number }> {
    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, WebP, and GIF are allowed.',
      );
    }

    // Delete old logo if exists
    if (oldLogoUrl) {
      await this.deleteGymLogo(oldLogoUrl);
    }

    // Compress image while keeping original format
    const compressed = await this.compressImage(file.buffer, file.mimetype);

    // Generate unique filename - store in gyms/{gymId}/logo/ folder
    const timestamp = Date.now();
    const filename = `gyms/${gymId}/logo/${timestamp}.${compressed.format}`;

    // Upload to S3 (Supabase Storage)
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: filename,
          Body: compressed.buffer,
          ContentType: compressed.contentType,
        }),
      );
    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw new BadRequestException('Failed to upload image. Please check storage configuration.');
    }

    // Return public URL
    const url = `${this.publicUrl}/${filename}`;

    return {
      url,
      size: compressed.buffer.length,
    };
  }

  /**
   * Delete a gym logo from storage
   */
  async deleteGymLogo(logoUrl: string): Promise<void> {
    if (!logoUrl || !logoUrl.includes(this.publicUrl)) {
      return; // Not our file or no URL
    }

    try {
      const key = logoUrl.replace(`${this.publicUrl}/`, '');
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      console.error('Failed to delete gym logo:', error);
      // Don't throw - deletion failure shouldn't break the flow
    }
  }

  /**
   * Upload a generic file
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    filename?: string,
  ): Promise<{ url: string; size: number }> {
    const finalFilename = filename || `${Date.now()}-${file.originalname}`;
    const key = `${folder}/${finalFilename}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      url: `${this.publicUrl}/${key}`,
      size: file.size,
    };
  }
}
