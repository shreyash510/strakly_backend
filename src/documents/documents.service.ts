import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { UploadService } from '../upload/upload.service';
import { PdfGeneratorService } from '../reports/pdf-generator.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  SignDocumentDto,
  TemplateFiltersDto,
} from './dto/document.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly uploadService: UploadService,
    private readonly pdfGeneratorService: PdfGeneratorService,
  ) {}

  private formatTemplate(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      type: row.type,
      content: row.content,
      version: row.version,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatSignedDoc(row: Record<string, any>) {
    return {
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name,
      templateType: row.template_type,
      userId: row.user_id,
      signerName: row.signer_name,
      versionSigned: row.version_signed,
      agreed: row.agreed,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      signatureData: row.signature_data,
      pdfUrl: row.pdf_url,
      signedAt: row.signed_at,
    };
  }

  async findAllTemplates(
    gymId: number,
    branchId: number | null = null,
    filters: TemplateFiltersDto = {},
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['t.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (!filters.includeInactive) {
        conditions.push('t.is_active = TRUE');
      }

      if (branchId !== null) {
        conditions.push(`(t.branch_id = $${paramIndex++} OR t.branch_id IS NULL)`);
        values.push(branchId);
      }

      if (filters.type) {
        conditions.push(`t.type = $${paramIndex++}`);
        values.push(filters.type);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await client.query(
        `SELECT t.*
         FROM document_templates t
         ${whereClause}
         ORDER BY t.created_at DESC`,
        values,
      );

      return result.rows.map((row) => this.formatTemplate(row));
    });
  }

  async findTemplateById(id: number, gymId: number) {
    const template = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT t.*
         FROM document_templates t
         WHERE t.id = $1 AND t.is_deleted = FALSE`,
        [id],
      );
      return result.rows[0];
    });

    if (!template) {
      throw new NotFoundException(`Template #${id} not found`);
    }

    return this.formatTemplate(template);
  }

  async createTemplate(
    gymId: number,
    branchId: number | null,
    dto: CreateTemplateDto,
    userId: number,
  ) {
    const template = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO document_templates (branch_id, name, type, content, version, is_active, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, TRUE, $5, NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.name,
          dto.type || 'waiver',
          dto.content,
          userId,
        ],
      );
      return result.rows[0];
    });

    return this.formatTemplate(template);
  }

  async updateTemplate(id: number, gymId: number, dto: UpdateTemplateDto) {
    await this.findTemplateById(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(dto.type);
    }
    if (dto.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(dto.content);
      updates.push(`version = version + 1`);
    }
    if (dto.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(dto.isActive);
    }

    if (updates.length === 0) return this.findTemplateById(id, gymId);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE document_templates SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findTemplateById(id, gymId);
  }

  async softDeleteTemplate(id: number, gymId: number) {
    await this.findTemplateById(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE document_templates SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { message: 'Template deleted successfully' };
  }

  async signDocument(
    gymId: number,
    branchId: number | null,
    dto: SignDocumentDto,
    userId: number,
    ipAddress: string,
    userAgent: string,
  ) {
    const template = await this.findTemplateById(dto.templateId, gymId);

    const signed = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO signed_documents (template_id, branch_id, user_id, signer_name, version_signed, agreed, signature_data, ip_address, user_agent, signed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING *`,
        [
          dto.templateId,
          branchId,
          userId,
          dto.signerName,
          template.version,
          dto.agreed,
          dto.signatureData || null,
          ipAddress,
          userAgent,
        ],
      );
      return result.rows[0];
    });

    // Fire-and-forget PDF generation
    this.generateAndStorePdf(signed.id, gymId).catch((err) => {
      this.logger.error(`Failed to generate PDF for signed doc #${signed.id}:`, err);
    });

    return this.formatSignedDoc({
      ...signed,
      template_name: template.name,
      template_type: template.type,
    });
  }

  async getSignedByUser(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT sd.*, dt.name as template_name, dt.type as template_type
         FROM signed_documents sd
         LEFT JOIN document_templates dt ON dt.id = sd.template_id
         WHERE sd.user_id = $1
         ORDER BY sd.signed_at DESC`,
        [userId],
      );

      return result.rows.map((row) => this.formatSignedDoc(row));
    });
  }

  async getMySignedDocs(userId: number, gymId: number) {
    return this.getSignedByUser(userId, gymId);
  }

  async generateAndStorePdf(signedDocId: number, gymId: number): Promise<string> {
    // Fetch signed doc + template content
    const docData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT sd.*, dt.name as template_name, dt.content as template_content, dt.type as template_type
         FROM signed_documents sd
         JOIN document_templates dt ON dt.id = sd.template_id
         WHERE sd.id = $1`,
        [signedDocId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Signed document #${signedDocId} not found`);
      }
      return result.rows[0];
    });

    // Build HTML for PDF
    const signatureHtml = docData.signature_data
      ? `<div style="margin-top:24px;"><p style="font-weight:600;margin-bottom:8px;">Signature:</p><img src="${docData.signature_data}" style="max-width:300px;max-height:120px;border:1px solid #e2e8f0;border-radius:4px;" /></div>`
      : '';

    const signedDate = new Date(docData.signed_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; padding: 0; margin: 0; }
          .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
          .header h1 { font-size: 22px; margin: 0 0 4px 0; }
          .header .type { color: #64748b; font-size: 13px; text-transform: uppercase; }
          .content { margin-bottom: 32px; }
          .footer { border-top: 2px solid #e2e8f0; padding-top: 16px; margin-top: 32px; }
          .footer-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
          .label { color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${docData.template_name}</h1>
          <div class="type">${docData.template_type}</div>
        </div>
        <div class="content">${docData.template_content}</div>
        ${signatureHtml}
        <div class="footer">
          <div class="footer-row"><span class="label">Signed by:</span> <span>${docData.signer_name}</span></div>
          <div class="footer-row"><span class="label">Date:</span> <span>${signedDate}</span></div>
          <div class="footer-row"><span class="label">IP Address:</span> <span>${docData.ip_address || 'N/A'}</span></div>
          <div class="footer-row"><span class="label">Version:</span> <span>v${docData.version_signed}</span></div>
        </div>
      </body>
      </html>
    `;

    // Generate PDF buffer
    const pdfBuffer = await this.pdfGeneratorService.generatePdf(html);

    // Upload to S3
    const filename = `signed-doc-${signedDocId}-${Date.now()}.pdf`;
    const fakeFile = {
      buffer: pdfBuffer,
      originalname: filename,
      mimetype: 'application/pdf',
      size: pdfBuffer.length,
    } as Express.Multer.File;
    const { url } = await this.uploadService.uploadFile(fakeFile, 'documents', filename);

    // Store pdf_url
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE signed_documents SET pdf_url = $1 WHERE id = $2`,
        [url, signedDocId],
      );
    });

    return url;
  }

  async getSignedDocPdf(signedDocId: number, gymId: number) {
    const doc = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, pdf_url FROM signed_documents WHERE id = $1`,
        [signedDocId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Signed document #${signedDocId} not found`);
      }
      return result.rows[0];
    });

    if (doc.pdf_url) {
      return { pdfUrl: doc.pdf_url };
    }

    // Generate on-demand if not yet generated
    const url = await this.generateAndStorePdf(signedDocId, gymId);
    return { pdfUrl: url };
  }
}
