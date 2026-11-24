import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import type { AskSource } from './ask.service';

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTurnView {
  id: string;
  question: string;
  answer: string;
  model: string | null;
  insufficientData: boolean;
  sources: AskSource[];
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  turns: ConversationTurnView[];
}

interface ConversationRow {
  id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TurnRow {
  id: string;
  question: string;
  answer: string;
  model: string | null;
  insufficient_data: boolean;
  sources: unknown;
  created_at: Date | string;
}

@Injectable()
export class ConversationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string, userId: string): Promise<ConversationSummary[]> {
    const result = await this.db.tenantQuery<ConversationRow>(
      tenantId,
      `SELECT c.id, c.title, c.created_at, c.updated_at
       FROM conversations c
       WHERE c.tenant_id = $1
         AND c.user_id = $2
         AND EXISTS (
           SELECT 1
           FROM chat_turns t
           WHERE t.conversation_id = c.id
             AND t.tenant_id = c.tenant_id
             AND t.user_id = c.user_id
         )
       ORDER BY c.updated_at DESC
       LIMIT 100`,
      [tenantId, userId],
    );
    return result.rows.map(toSummary);
  }

  async get(tenantId: string, userId: string, id: string): Promise<ConversationDetail> {
    const conversation = await this.findOwned(tenantId, userId, id);
    const turns = await this.db.tenantQuery<TurnRow>(
      tenantId,
      `SELECT id, question, answer, model, insufficient_data, sources, created_at
       FROM chat_turns
       WHERE conversation_id = $1
         AND tenant_id = $2
         AND user_id = $3
       ORDER BY created_at ASC, id ASC`,
      [id, tenantId, userId],
    );
    return {
      ...toSummary(conversation),
      turns: turns.rows.map(toTurn),
    };
  }

  async remove(tenantId: string, userId: string, id: string): Promise<void> {
    const result = await this.db.tenantQuery(tenantId,
      `DELETE FROM conversations
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [id, tenantId, userId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    }
  }

  async open(
    tenantId: string,
    userId: string,
    conversationId: string | undefined,
    question: string,
  ): Promise<{ id: string; title: string; created: boolean }> {
    if (!conversationId) {
      const id = randomUUID();
      const title = conversationTitle(question);
      await this.db.tenantQuery(tenantId,
        `INSERT INTO conversations (id, tenant_id, user_id, title)
         VALUES ($1, $2, $3, $4)`,
        [id, tenantId, userId, title],
      );
      return { id, title, created: true };
    }

    const existing = await this.findOwned(tenantId, userId, conversationId);
    return { id: existing.id, title: existing.title, created: false };
  }

  async appendTurn(input: {
    conversationId: string;
    tenantId: string;
    userId: string;
    question: string;
    answer: string;
    model?: string;
    insufficientData: boolean;
    sources: AskSource[];
  }): Promise<void> {
    await this.db.asTenant(input.tenantId, async (query) => {
      const updated = await query<{ id: string }>(
        `UPDATE conversations
         SET updated_at = clock_timestamp()
         WHERE id = $1 AND tenant_id = $2 AND user_id = $3
         RETURNING id`,
        [input.conversationId, input.tenantId, input.userId],
      );
      if (!updated.rows[0]) {
        throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
      }
      await query(
        `INSERT INTO chat_turns (
           id, conversation_id, tenant_id, user_id, question, answer, model, insufficient_data, sources
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          randomUUID(),
          input.conversationId,
          input.tenantId,
          input.userId,
          input.question,
          input.answer,
          input.model ?? null,
          input.insufficientData,
          JSON.stringify(input.sources),
        ],
      );
    });
  }

  async removeIfEmpty(tenantId: string, userId: string, id: string): Promise<void> {
    await this.db.tenantQuery(tenantId,
      `DELETE FROM conversations c
       WHERE c.id = $1
         AND c.tenant_id = $2
         AND c.user_id = $3
         AND NOT EXISTS (
           SELECT 1 FROM chat_turns t WHERE t.conversation_id = c.id
         )`,
      [id, tenantId, userId],
    );
  }

  private async findOwned(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<ConversationRow> {
    const result = await this.db.tenantQuery<ConversationRow>(
      tenantId,
      `SELECT id, title, created_at, updated_at
       FROM conversations
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [id, tenantId, userId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    }
    return row;
  }
}

function conversationTitle(question: string): string {
  const compact = question.trim().replace(/\s+/g, ' ');
  if (compact.length <= 80) return compact || 'Cuộc trò chuyện';
  return `${compact.slice(0, 79).trimEnd()}…`;
}

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toTurn(row: TurnRow): ConversationTurnView {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    model: row.model,
    insufficientData: row.insufficient_data,
    sources: readSources(row.sources),
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function readSources(value: unknown): AskSource[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const sources: AskSource[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.documentId !== 'string' || typeof row.filename !== 'string') continue;
    const score = typeof row.score === 'number' ? row.score : Number(row.score);
    sources.push({
      documentId: row.documentId,
      filename: row.filename,
      snippet: typeof row.snippet === 'string' ? row.snippet : '',
      score: Number.isFinite(score) ? score : 0,
    });
  }
  return sources;
}
