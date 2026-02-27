import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../database/prisma.service';
import {
  CreateCampaignTemplateDto,
  UpdateCampaignTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  AudienceFilterDto,
  CampaignTemplateFiltersDto,
  CampaignFiltersDto,
  RecipientFiltersDto,
  CampaignType,
  CampaignStatus,
} from './dto/campaigns.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  private formatTemplate(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      type: row.type,
      subject: row.subject,
      content: row.content,
      mergeFields: row.merge_fields,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatCampaign(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      templateId: row.template_id,
      name: row.name,
      type: row.type,
      subject: row.subject,
      content: row.content,
      audienceFilter: row.audience_filter,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      status: row.status,
      totalRecipients: row.total_recipients,
      totalSent: row.total_sent,
      totalOpened: row.total_opened,
      totalClicked: row.total_clicked,
      totalBounced: row.total_bounced,
      totalUnsubscribed: row.total_unsubscribed,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatRecipient(row: Record<string, any>) {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      userId: row.user_id,
      userName: row.user_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      openedAt: row.opened_at,
      clickedAt: row.clicked_at,
      bouncedAt: row.bounced_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }

  // ─── Templates ───

  async findAllTemplates(
    gymId: number,
    branchId: number | null,
    filters: CampaignTemplateFiltersDto = {},
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(branch_id = $${paramIndex} OR branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

      if (filters.type) {
        conditions.push(`type = $${paramIndex++}`);
        values.push(filters.type);
      }

      const result = await client.query(
        `SELECT * FROM campaign_templates WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
        values,
      );

      return result.rows.map((r) => this.formatTemplate(r));
    });
  }

  async findOneTemplate(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM campaign_templates WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }
      return this.formatTemplate(result.rows[0]);
    });
  }

  async createTemplate(
    gymId: number,
    branchId: number | null,
    dto: CreateCampaignTemplateDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO campaign_templates (branch_id, name, type, subject, content, merge_fields)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          branchId,
          dto.name,
          dto.type,
          dto.subject || null,
          dto.content,
          dto.mergeFields ? JSON.stringify(dto.mergeFields) : null,
        ],
      );
      return this.formatTemplate(result.rows[0]);
    });
  }

  async updateTemplate(
    id: number,
    gymId: number,
    dto: UpdateCampaignTemplateDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM campaign_templates WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }

      const fields: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(dto.name);
      }
      if (dto.type !== undefined) {
        fields.push(`type = $${paramIndex++}`);
        values.push(dto.type);
      }
      if (dto.subject !== undefined) {
        fields.push(`subject = $${paramIndex++}`);
        values.push(dto.subject);
      }
      if (dto.content !== undefined) {
        fields.push(`content = $${paramIndex++}`);
        values.push(dto.content);
      }
      if (dto.mergeFields !== undefined) {
        fields.push(`merge_fields = $${paramIndex++}`);
        values.push(JSON.stringify(dto.mergeFields));
      }

      if (fields.length === 0) {
        return this.formatTemplate(existing.rows[0]);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query(
        `UPDATE campaign_templates SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );
      return this.formatTemplate(result.rows[0]);
    });
  }

  async softDeleteTemplate(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE campaign_templates SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Template with ID ${id} not found`);
      }
      return { message: 'Template deleted successfully' };
    });
  }

  // ─── Campaigns ───

  async findAllCampaigns(
    gymId: number,
    branchId: number | null,
    filters: CampaignFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['c.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`c.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (filters.type) {
        conditions.push(`c.type = $${paramIndex++}`);
        values.push(filters.type);
      }

      if (filters.status) {
        conditions.push(`c.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.search) {
        conditions.push(`c.name ILIKE $${paramIndex++}`);
        values.push(`%${filters.search}%`);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM campaigns c WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT c.*, u.name as created_by_name
         FROM campaigns c
         LEFT JOIN users u ON u.id = c.created_by
         WHERE ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatCampaign(r)),
        total,
        page,
        limit,
      };
    });
  }

  async findOneCampaign(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT c.*, u.name as created_by_name
         FROM campaigns c
         LEFT JOIN users u ON u.id = c.created_by
         WHERE c.id = $1 AND c.is_deleted = FALSE`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }
      return this.formatCampaign(result.rows[0]);
    });
  }

  async createCampaign(
    gymId: number,
    branchId: number | null,
    dto: CreateCampaignDto,
    createdBy: number,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let subject = dto.subject || null;
      let content = dto.content || null;

      // If templateId provided, load template content
      if (dto.templateId) {
        const tmpl = await client.query(
          `SELECT subject, content FROM campaign_templates WHERE id = $1 AND is_deleted = FALSE`,
          [dto.templateId],
        );
        if (tmpl.rows.length === 0) {
          throw new NotFoundException(`Template with ID ${dto.templateId} not found`);
        }
        subject = subject || tmpl.rows[0].subject;
        content = content || tmpl.rows[0].content;
      }

      const result = await client.query(
        `INSERT INTO campaigns (branch_id, template_id, name, type, subject, content, audience_filter, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8) RETURNING *`,
        [
          branchId,
          dto.templateId || null,
          dto.name,
          dto.type,
          subject,
          content,
          JSON.stringify(dto.audienceFilter),
          createdBy,
        ],
      );

      return this.formatCampaign(result.rows[0]);
    });
  }

  async updateCampaign(id: number, gymId: number, dto: UpdateCampaignDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM campaigns WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }
      if (existing.rows[0].status !== CampaignStatus.DRAFT) {
        throw new BadRequestException('Only draft campaigns can be updated');
      }

      const fields: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(dto.name);
      }
      if (dto.subject !== undefined) {
        fields.push(`subject = $${paramIndex++}`);
        values.push(dto.subject);
      }
      if (dto.content !== undefined) {
        fields.push(`content = $${paramIndex++}`);
        values.push(dto.content);
      }
      if (dto.audienceFilter !== undefined) {
        fields.push(`audience_filter = $${paramIndex++}`);
        values.push(JSON.stringify(dto.audienceFilter));
      }

      if (fields.length === 0) {
        return this.findOneCampaign(id, gymId);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query(
        `UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );

      return this.formatCampaign(result.rows[0]);
    });
  }

  async softDeleteCampaign(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT status FROM campaigns WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }
      if (existing.rows[0].status !== CampaignStatus.DRAFT) {
        throw new BadRequestException('Only draft campaigns can be deleted');
      }

      await client.query(
        `UPDATE campaigns SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id],
      );
      return { message: 'Campaign deleted successfully' };
    });
  }

  // ─── Sending ───

  async sendCampaign(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const campaign = await client.query(
        `SELECT * FROM campaigns WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (campaign.rows.length === 0) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }

      const c = campaign.rows[0];
      if (c.status !== CampaignStatus.DRAFT && c.status !== CampaignStatus.SCHEDULED) {
        throw new BadRequestException(`Campaign cannot be sent from "${c.status}" status`);
      }

      if (c.type === CampaignType.SMS) {
        throw new BadRequestException('SMS campaigns are not yet supported. Only email campaigns can be sent.');
      }

      if (!c.subject || !c.content) {
        throw new BadRequestException('Campaign must have a subject and content to be sent');
      }

      // Set status to sending
      await client.query(
        `UPDATE campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id],
      );

      return this.executeCampaignSend(client, c, id, gymId);
    });
  }

  /** Called by scheduler after atomic claim (status already set to 'sending') */
  async sendCampaignInternal(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const campaign = await client.query(
        `SELECT * FROM campaigns WHERE id = $1 AND status = 'sending' AND is_deleted = FALSE`,
        [id],
      );
      if (campaign.rows.length === 0) {
        this.logger.warn(`Campaign ${id} not found or not in sending status`);
        return;
      }
      return this.executeCampaignSend(client, campaign.rows[0], id, gymId);
    });
  }

  private async executeCampaignSend(client: any, c: Record<string, any>, id: number, gymId: number) {
    // Resolve audience
    const audienceFilter: AudienceFilterDto = c.audience_filter || {};
    const recipients = await this.resolveAudience(client, audienceFilter, c.branch_id);

    if (recipients.length === 0) {
      await client.query(
        `UPDATE campaigns SET status = 'sent', sent_at = CURRENT_TIMESTAMP, total_recipients = 0, total_sent = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id],
      );
      return { ...this.formatCampaign({ ...c, status: 'sent', total_recipients: 0 }), message: 'No recipients matched the audience filter' };
    }

    // Batch insert recipients in chunks of 100
    const RECIPIENT_BATCH = 100;
    for (let i = 0; i < recipients.length; i += RECIPIENT_BATCH) {
      const batch = recipients.slice(i, i + RECIPIENT_BATCH);
      const values: any[] = [];
      const placeholders: string[] = [];

      batch.forEach((r, idx) => {
        const offset = idx * 4;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, 'pending')`);
        values.push(id, r.userId, r.email, r.phone);
      });

      await client.query(
        `INSERT INTO campaign_recipients (campaign_id, user_id, email, phone, status)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    // Update total recipients
    await client.query(
      `UPDATE campaigns SET total_recipients = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [recipients.length, id],
    );

    // Get gym name for merge fields
    const gym = await this.prisma.gym.findFirst({
      where: { tenantSchemaName: `tenant_${gymId}` },
      select: { name: true },
    });
    const gymName = gym?.name || 'Our Gym';

    // Send emails in chunks of 10 for controlled concurrency
    let sentCount = 0;
    let bouncedCount = 0;
    const emailRecipients = recipients.filter((r) => r.email);

    const EMAIL_CHUNK = 10;
    for (let i = 0; i < emailRecipients.length; i += EMAIL_CHUNK) {
      const chunk = emailRecipients.slice(i, i + EMAIL_CHUNK);

      const results = await Promise.allSettled(
        chunk.map(async (r) => {
          const personalizedContent = this.replaceMergeFields(c.content, r, gymName);
          const personalizedSubject = this.replaceMergeFields(c.subject, r, gymName);

          try {
            const result = await this.emailService.sendEmail({
              to: r.email,
              subject: personalizedSubject,
              html: personalizedContent,
            });

            if (result.success) {
              await client.query(
                `UPDATE campaign_recipients SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = $1 AND user_id = $2`,
                [id, r.userId],
              );
              return true;
            } else {
              await client.query(
                `UPDATE campaign_recipients SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = $2 AND user_id = $3`,
                [result.error || 'Send failed', id, r.userId],
              );
              return false;
            }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            await client.query(
              `UPDATE campaign_recipients SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE campaign_id = $2 AND user_id = $3`,
              [errMsg, id, r.userId],
            );
            return false;
          }
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          sentCount++;
        } else {
          bouncedCount++;
        }
      }
    }

    // Update campaign stats
    await client.query(
      `UPDATE campaigns SET status = 'sent', sent_at = CURRENT_TIMESTAMP, total_sent = $1, total_bounced = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [sentCount, bouncedCount, id],
    );

    return {
      message: 'Campaign sent successfully',
      totalRecipients: recipients.length,
      totalSent: sentCount,
      totalFailed: bouncedCount,
    };
  }

  async scheduleCampaign(id: number, gymId: number, dto: ScheduleCampaignDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM campaigns WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }
      if (existing.rows[0].status !== CampaignStatus.DRAFT) {
        throw new BadRequestException('Only draft campaigns can be scheduled');
      }

      const result = await client.query(
        `UPDATE campaigns SET status = 'scheduled', scheduled_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [dto.scheduledAt, id],
      );

      return this.formatCampaign(result.rows[0]);
    });
  }

  async cancelCampaign(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM campaigns WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Campaign with ID ${id} not found`);
      }
      if (existing.rows[0].status !== CampaignStatus.SCHEDULED) {
        throw new BadRequestException('Only scheduled campaigns can be cancelled');
      }

      const result = await client.query(
        `UPDATE campaigns SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [id],
      );

      return this.formatCampaign(result.rows[0]);
    });
  }

  // ─── Recipients ───

  async getRecipients(
    campaignId: number,
    gymId: number,
    filters: RecipientFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [`cr.campaign_id = $1`];
      const values: SqlValue[] = [campaignId];
      let paramIndex = 2;

      if (filters.status) {
        conditions.push(`cr.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM campaign_recipients cr WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT cr.*, u.name as user_name
         FROM campaign_recipients cr
         LEFT JOIN users u ON u.id = cr.user_id
         WHERE ${whereClause}
         ORDER BY cr.created_at ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatRecipient(r)),
        total,
        page,
        limit,
      };
    });
  }

  // ─── Audience ───

  async previewAudience(
    gymId: number,
    branchId: number | null,
    filter: AudienceFilterDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const recipients = await this.resolveAudience(client, filter, branchId);
      return {
        count: recipients.length,
        sample: recipients.slice(0, 10).map((r) => ({
          name: r.name,
          email: r.email,
          role: r.role,
        })),
      };
    });
  }

  // ─── Scheduled Campaign Processing ───

  async processScheduledCampaigns() {
    try {
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true, tenantSchemaName: true },
      });

      for (const gym of gyms) {
        try {
          const campaigns = await this.tenantService.executeInTenant(
            gym.id,
            async (client) => {
              // Atomically claim up to 3 scheduled campaigns to prevent double-send and limit memory
              const result = await client.query(
                `UPDATE campaigns SET status = 'sending', updated_at = CURRENT_TIMESTAMP
                 WHERE id IN (
                   SELECT id FROM campaigns
                   WHERE status = 'scheduled' AND scheduled_at <= CURRENT_TIMESTAMP AND is_deleted = FALSE
                   ORDER BY scheduled_at ASC
                   LIMIT 3
                 )
                 RETURNING id`,
              );
              return result.rows;
            },
          );

          for (const campaign of campaigns) {
            try {
              await this.sendCampaignInternal(campaign.id, gym.id);
              this.logger.log(
                `Sent scheduled campaign ${campaign.id} for gym ${gym.id}`,
              );
            } catch (error) {
              this.logger.error(
                `Failed to send scheduled campaign ${campaign.id} for gym ${gym.id}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        } catch (error) {
          this.logger.error(
            `Error processing scheduled campaigns for gym ${gym.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in processScheduledCampaigns: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ─── Private Helpers ───

  private async resolveAudience(
    client: any,
    filter: AudienceFilterDto,
    branchId: number | null,
  ): Promise<
    Array<{
      userId: number;
      name: string;
      email: string;
      phone: string;
      role: string;
    }>
  > {
    const conditions: string[] = ['is_deleted = FALSE', 'email IS NOT NULL'];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (filter.roles && filter.roles.length > 0) {
      conditions.push(`role = ANY($${paramIndex++})`);
      values.push(filter.roles);
    }

    if (filter.statuses && filter.statuses.length > 0) {
      conditions.push(`status = ANY($${paramIndex++})`);
      values.push(filter.statuses);
    }

    if (filter.branchIds && filter.branchIds.length > 0) {
      conditions.push(`branch_id = ANY($${paramIndex++})`);
      values.push(filter.branchIds);
    } else if (branchId !== null) {
      conditions.push(`branch_id = $${paramIndex++}`);
      values.push(branchId);
    }

    if (filter.joinedAfter) {
      conditions.push(`join_date >= $${paramIndex++}`);
      values.push(filter.joinedAfter);
    }

    if (filter.joinedBefore) {
      conditions.push(`join_date <= $${paramIndex++}`);
      values.push(filter.joinedBefore);
    }

    let query = `SELECT id as user_id, name, email, phone, role FROM users WHERE ${conditions.join(' AND ')}`;

    if (filter.membershipPlanIds && filter.membershipPlanIds.length > 0) {
      query += ` AND id IN (SELECT user_id FROM memberships WHERE plan_id = ANY($${paramIndex++}) AND status = 'active' AND is_deleted = FALSE)`;
      values.push(filter.membershipPlanIds);
    }

    const result = await client.query(query, values);

    return result.rows.map((r: any) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
    }));
  }

  private replaceMergeFields(
    text: string,
    user: { name: string; email: string; phone: string },
    gymName: string,
  ): string {
    return text
      .replace(/\{\{name\}\}/g, user.name || '')
      .replace(/\{\{email\}\}/g, user.email || '')
      .replace(/\{\{phone\}\}/g, user.phone || '')
      .replace(/\{\{gym_name\}\}/g, gymName || '');
  }
}
