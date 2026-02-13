import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  SubmitSurveyResponseDto,
  SurveyFiltersDto,
} from './dto/surveys.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class SurveysService {
  constructor(private readonly tenantService: TenantService) {}

  private formatSurvey(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      isAnonymous: row.is_anonymous,
      triggerType: row.trigger_type,
      triggerConfig: row.trigger_config,
      startDate: row.start_date,
      endDate: row.end_date,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      responseCount: row.response_count !== undefined
        ? parseInt(row.response_count)
        : undefined,
      questions: row.questions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatQuestion(row: Record<string, any>) {
    return {
      id: row.id,
      surveyId: row.survey_id,
      questionText: row.question_text,
      questionType: row.question_type,
      options: row.options,
      isRequired: row.is_required,
      displayOrder: row.display_order,
      createdAt: row.created_at,
    };
  }

  // ─── List Surveys ───

  async findAll(
    gymId: number,
    branchId: number | null,
    filters: SurveyFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['s.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(s.branch_id = $${paramIndex} OR s.branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

      if (filters.type) {
        conditions.push(`s.type = $${paramIndex++}`);
        values.push(filters.type);
      }

      if (filters.status) {
        conditions.push(`s.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM surveys s WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT s.*, u.name as created_by_name,
                (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) as response_count
         FROM surveys s
         LEFT JOIN users u ON u.id = s.created_by
         WHERE ${whereClause}
         ORDER BY s.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatSurvey(r)),
        total,
        page,
        limit,
      };
    });
  }

  // ─── Get Single Survey ───

  async findOne(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, u.name as created_by_name
         FROM surveys s
         LEFT JOIN users u ON u.id = s.created_by
         WHERE s.id = $1 AND s.is_deleted = FALSE`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Survey with ID ${id} not found`);
      }

      const questionsResult = await client.query(
        `SELECT * FROM survey_questions
         WHERE survey_id = $1
         ORDER BY display_order ASC, id ASC`,
        [id],
      );

      const survey = this.formatSurvey(result.rows[0]);
      survey.questions = questionsResult.rows.map((q) => this.formatQuestion(q));

      return survey;
    });
  }

  // ─── Create Survey ───

  async create(
    dto: CreateSurveyDto,
    gymId: number,
    branchId: number | null,
    userId: number,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Insert survey
      const surveyResult = await client.query(
        `INSERT INTO surveys (branch_id, title, description, type, status, is_anonymous, trigger_type, trigger_config, start_date, end_date, created_by)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          branchId,
          dto.title,
          dto.description || null,
          dto.type || 'custom',
          dto.isAnonymous || false,
          dto.triggerType || null,
          dto.triggerConfig ? JSON.stringify(dto.triggerConfig) : null,
          dto.startDate || null,
          dto.endDate || null,
          userId,
        ],
      );

      const survey = surveyResult.rows[0];

      // Insert questions
      const questions: ReturnType<typeof this.formatQuestion>[] = [];
      for (let i = 0; i < dto.questions.length; i++) {
        const q = dto.questions[i];
        const qResult = await client.query(
          `INSERT INTO survey_questions (survey_id, question_text, question_type, options, is_required, display_order)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            survey.id,
            q.questionText,
            q.questionType,
            q.options ? JSON.stringify(q.options) : null,
            q.isRequired !== undefined ? q.isRequired : true,
            q.displayOrder !== undefined ? q.displayOrder : i + 1,
          ],
        );
        questions.push(this.formatQuestion(qResult.rows[0]));
      }

      const formatted = this.formatSurvey(survey);
      formatted.questions = questions;

      return formatted;
    });
  }

  // ─── Update Survey ───

  async update(id: number, gymId: number, dto: UpdateSurveyDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM surveys WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Survey with ID ${id} not found`);
      }

      const fields: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.title !== undefined) {
        fields.push(`title = $${paramIndex++}`);
        values.push(dto.title);
      }
      if (dto.description !== undefined) {
        fields.push(`description = $${paramIndex++}`);
        values.push(dto.description);
      }
      if (dto.type !== undefined) {
        fields.push(`type = $${paramIndex++}`);
        values.push(dto.type);
      }
      if (dto.isAnonymous !== undefined) {
        fields.push(`is_anonymous = $${paramIndex++}`);
        values.push(dto.isAnonymous);
      }
      if (dto.triggerType !== undefined) {
        fields.push(`trigger_type = $${paramIndex++}`);
        values.push(dto.triggerType);
      }
      if (dto.triggerConfig !== undefined) {
        fields.push(`trigger_config = $${paramIndex++}`);
        values.push(JSON.stringify(dto.triggerConfig));
      }
      if (dto.startDate !== undefined) {
        fields.push(`start_date = $${paramIndex++}`);
        values.push(dto.startDate);
      }
      if (dto.endDate !== undefined) {
        fields.push(`end_date = $${paramIndex++}`);
        values.push(dto.endDate);
      }

      if (fields.length === 0) {
        return this.findOne(id, gymId);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query(
        `UPDATE surveys SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );

      return this.formatSurvey(result.rows[0]);
    });
  }

  // ─── Update Status ───

  async updateStatus(id: number, gymId: number, status: string) {
    const validStatuses = ['draft', 'active', 'closed', 'archived'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM surveys WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Survey with ID ${id} not found`);
      }

      const result = await client.query(
        `UPDATE surveys SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND is_deleted = FALSE RETURNING *`,
        [status, id],
      );

      return this.formatSurvey(result.rows[0]);
    });
  }

  // ─── Soft Delete ───

  async softDelete(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE surveys SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Survey with ID ${id} not found`);
      }
      return { message: 'Survey deleted successfully' };
    });
  }

  // ─── Submit Response ───

  async submitResponse(
    surveyId: number,
    gymId: number,
    userId: number,
    dto: SubmitSurveyResponseDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Verify survey exists and is active
      const survey = await client.query(
        `SELECT id, status, is_anonymous FROM surveys WHERE id = $1 AND is_deleted = FALSE`,
        [surveyId],
      );
      if (survey.rows.length === 0) {
        throw new NotFoundException(`Survey with ID ${surveyId} not found`);
      }
      if (survey.rows[0].status !== 'active') {
        throw new BadRequestException('Survey is not currently active');
      }

      // Check if user already responded
      const existingResponse = await client.query(
        `SELECT id FROM survey_responses WHERE survey_id = $1 AND user_id = $2`,
        [surveyId, userId],
      );
      if (existingResponse.rows.length > 0) {
        throw new BadRequestException('You have already responded to this survey');
      }

      // Insert response
      const responseResult = await client.query(
        `INSERT INTO survey_responses (survey_id, user_id)
         VALUES ($1, $2)
         RETURNING *`,
        [surveyId, userId],
      );
      const responseId = responseResult.rows[0].id;

      // Insert answers
      for (const answer of dto.answers) {
        await client.query(
          `INSERT INTO survey_answers (response_id, question_id, answer_text, answer_numeric, answer_choices)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            responseId,
            answer.questionId,
            answer.answerText || null,
            answer.answerNumeric !== undefined ? answer.answerNumeric : null,
            answer.answerChoices ? JSON.stringify(answer.answerChoices) : null,
          ],
        );
      }

      return {
        message: 'Survey response submitted successfully',
        responseId,
      };
    });
  }

  // ─── Get Responses ───

  async getResponses(
    surveyId: number,
    gymId: number,
    filters: SurveyFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Verify survey exists
      const survey = await client.query(
        `SELECT id FROM surveys WHERE id = $1 AND is_deleted = FALSE`,
        [surveyId],
      );
      if (survey.rows.length === 0) {
        throw new NotFoundException(`Survey with ID ${surveyId} not found`);
      }

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = $1`,
        [surveyId],
      );
      const total = parseInt(countResult.rows[0].total);

      const responsesResult = await client.query(
        `SELECT sr.*, u.name as user_name, u.email as user_email
         FROM survey_responses sr
         LEFT JOIN users u ON u.id = sr.user_id
         WHERE sr.survey_id = $1
         ORDER BY sr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [surveyId, limit, offset],
      );

      const responses: Record<string, any>[] = [];
      for (const resp of responsesResult.rows) {
        const answersResult = await client.query(
          `SELECT sa.*, sq.question_text, sq.question_type
           FROM survey_answers sa
           LEFT JOIN survey_questions sq ON sq.id = sa.question_id
           WHERE sa.response_id = $1
           ORDER BY sq.display_order ASC`,
          [resp.id],
        );

        responses.push({
          id: resp.id,
          surveyId: resp.survey_id,
          userId: resp.user_id,
          userName: resp.user_name,
          userEmail: resp.user_email,
          answers: answersResult.rows.map((a) => ({
            id: a.id,
            questionId: a.question_id,
            questionText: a.question_text,
            questionType: a.question_type,
            answerText: a.answer_text,
            answerNumeric: a.answer_numeric,
            answerChoices: a.answer_choices,
          })),
          createdAt: resp.created_at,
        });
      }

      return {
        data: responses,
        total,
        page,
        limit,
      };
    });
  }

  // ─── Analytics ───

  async getAnalytics(surveyId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Verify survey exists
      const survey = await client.query(
        `SELECT id, type, title FROM surveys WHERE id = $1 AND is_deleted = FALSE`,
        [surveyId],
      );
      if (survey.rows.length === 0) {
        throw new NotFoundException(`Survey with ID ${surveyId} not found`);
      }

      // Response count
      const responseCountResult = await client.query(
        `SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = $1`,
        [surveyId],
      );
      const responseCount = parseInt(responseCountResult.rows[0].total);

      // Per-question stats
      const questionsResult = await client.query(
        `SELECT * FROM survey_questions WHERE survey_id = $1 ORDER BY display_order ASC, id ASC`,
        [surveyId],
      );

      const questionStats: Record<string, any>[] = [];
      for (const q of questionsResult.rows) {
        const stats: Record<string, any> = {
          questionId: q.id,
          questionText: q.question_text,
          questionType: q.question_type,
        };

        if (['rating', 'nps', 'numeric'].includes(q.question_type)) {
          // Numeric stats: average, min, max
          const numResult = await client.query(
            `SELECT
               AVG(sa.answer_numeric) as avg_value,
               MIN(sa.answer_numeric) as min_value,
               MAX(sa.answer_numeric) as max_value,
               COUNT(sa.answer_numeric) as answer_count
             FROM survey_answers sa
             WHERE sa.question_id = $1 AND sa.answer_numeric IS NOT NULL`,
            [q.id],
          );
          const numRow = numResult.rows[0];
          stats.averageRating = numRow.avg_value !== null ? parseFloat(parseFloat(numRow.avg_value).toFixed(2)) : null;
          stats.minValue = numRow.min_value !== null ? parseFloat(numRow.min_value) : null;
          stats.maxValue = numRow.max_value !== null ? parseFloat(numRow.max_value) : null;
          stats.answerCount = parseInt(numRow.answer_count);
        }

        if (q.question_type === 'nps') {
          // NPS score breakdown: promoters (9-10), passives (7-8), detractors (0-6)
          const npsResult = await client.query(
            `SELECT
               COUNT(*) FILTER (WHERE sa.answer_numeric >= 9) as promoters,
               COUNT(*) FILTER (WHERE sa.answer_numeric >= 7 AND sa.answer_numeric <= 8) as passives,
               COUNT(*) FILTER (WHERE sa.answer_numeric <= 6) as detractors,
               COUNT(*) as total
             FROM survey_answers sa
             WHERE sa.question_id = $1 AND sa.answer_numeric IS NOT NULL`,
            [q.id],
          );
          const npsRow = npsResult.rows[0];
          const npsTotal = parseInt(npsRow.total);
          const promoters = parseInt(npsRow.promoters);
          const detractors = parseInt(npsRow.detractors);

          stats.nps = {
            promoters,
            passives: parseInt(npsRow.passives),
            detractors,
            total: npsTotal,
            score: npsTotal > 0
              ? Math.round(((promoters - detractors) / npsTotal) * 100)
              : null,
          };
        }

        if (['multiple_choice', 'single_choice'].includes(q.question_type)) {
          // Choice distribution
          const choicesResult = await client.query(
            `SELECT sa.answer_text, COUNT(*) as count
             FROM survey_answers sa
             WHERE sa.question_id = $1 AND sa.answer_text IS NOT NULL
             GROUP BY sa.answer_text
             ORDER BY count DESC`,
            [q.id],
          );
          stats.choiceDistribution = choicesResult.rows.map((c) => ({
            choice: c.answer_text,
            count: parseInt(c.count),
          }));
        }

        if (q.question_type === 'text') {
          // Just count text answers
          const textResult = await client.query(
            `SELECT COUNT(*) as count FROM survey_answers sa
             WHERE sa.question_id = $1 AND sa.answer_text IS NOT NULL AND sa.answer_text != ''`,
            [q.id],
          );
          stats.answerCount = parseInt(textResult.rows[0].count);
        }

        questionStats.push(stats);
      }

      // Overall NPS if this is an NPS survey
      let overallNps: Record<string, any> | null = null;
      if (survey.rows[0].type === 'nps') {
        const npsQuestion = questionsResult.rows.find(
          (q) => q.question_type === 'nps',
        );
        if (npsQuestion) {
          const npsResult = await client.query(
            `SELECT
               COUNT(*) FILTER (WHERE sa.answer_numeric >= 9) as promoters,
               COUNT(*) FILTER (WHERE sa.answer_numeric >= 7 AND sa.answer_numeric <= 8) as passives,
               COUNT(*) FILTER (WHERE sa.answer_numeric <= 6) as detractors,
               COUNT(*) as total
             FROM survey_answers sa
             WHERE sa.question_id = $1 AND sa.answer_numeric IS NOT NULL`,
            [npsQuestion.id],
          );
          const npsRow = npsResult.rows[0];
          const npsTotal = parseInt(npsRow.total);
          const promoters = parseInt(npsRow.promoters);
          const detractors = parseInt(npsRow.detractors);

          overallNps = {
            score: npsTotal > 0
              ? Math.round(((promoters - detractors) / npsTotal) * 100)
              : null,
            promoters,
            passives: parseInt(npsRow.passives),
            detractors,
            totalResponses: npsTotal,
          };
        }
      }

      return {
        surveyId,
        title: survey.rows[0].title,
        type: survey.rows[0].type,
        responseCount,
        overallNps,
        questionStats,
      };
    });
  }

  // ─── Pending Surveys (for client/trainer) ───

  async getPendingSurveys(gymId: number, userId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, u.name as created_by_name
         FROM surveys s
         LEFT JOIN users u ON u.id = s.created_by
         WHERE s.status = 'active'
           AND s.is_deleted = FALSE
           AND (s.start_date IS NULL OR s.start_date <= CURRENT_TIMESTAMP)
           AND (s.end_date IS NULL OR s.end_date >= CURRENT_TIMESTAMP)
           AND s.id NOT IN (
             SELECT sr.survey_id FROM survey_responses sr WHERE sr.user_id = $1
           )
         ORDER BY s.created_at DESC`,
        [userId],
      );

      return result.rows.map((r) => this.formatSurvey(r));
    });
  }

  // ─── Latest NPS Score ───

  async getLatestNps(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [
        "s.type = 'nps'",
        's.is_deleted = FALSE',
      ];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(s.branch_id = $${paramIndex} OR s.branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

      // Find the most recent NPS survey
      const surveyResult = await client.query(
        `SELECT s.id, s.title, s.status, s.created_at
         FROM surveys s
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.created_at DESC
         LIMIT 1`,
        values,
      );

      if (surveyResult.rows.length === 0) {
        return {
          surveyId: null,
          title: null,
          npsScore: null,
          message: 'No NPS survey found',
        };
      }

      const surveyRow = surveyResult.rows[0];

      // Find the NPS question in this survey
      const npsQuestion = await client.query(
        `SELECT id FROM survey_questions
         WHERE survey_id = $1 AND question_type = 'nps'
         LIMIT 1`,
        [surveyRow.id],
      );

      if (npsQuestion.rows.length === 0) {
        return {
          surveyId: surveyRow.id,
          title: surveyRow.title,
          npsScore: null,
          message: 'NPS survey has no NPS-type question',
        };
      }

      const npsResult = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE sa.answer_numeric >= 9) as promoters,
           COUNT(*) FILTER (WHERE sa.answer_numeric >= 7 AND sa.answer_numeric <= 8) as passives,
           COUNT(*) FILTER (WHERE sa.answer_numeric <= 6) as detractors,
           COUNT(*) as total
         FROM survey_answers sa
         JOIN survey_responses sr ON sr.id = sa.response_id
         WHERE sa.question_id = $1 AND sa.answer_numeric IS NOT NULL`,
        [npsQuestion.rows[0].id],
      );

      const npsRow = npsResult.rows[0];
      const npsTotal = parseInt(npsRow.total);
      const promoters = parseInt(npsRow.promoters);
      const passives = parseInt(npsRow.passives);
      const detractors = parseInt(npsRow.detractors);

      return {
        surveyId: surveyRow.id,
        title: surveyRow.title,
        status: surveyRow.status,
        npsScore: npsTotal > 0
          ? Math.round(((promoters - detractors) / npsTotal) * 100)
          : null,
        promoters,
        passives,
        detractors,
        totalResponses: npsTotal,
        createdAt: surveyRow.created_at,
      };
    });
  }
}
