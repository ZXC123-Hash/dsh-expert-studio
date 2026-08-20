/**
 * 创造模式 — 对话式创建/编辑专家与专家团
 * 核心：通过 AI 对话生成专家档案，用户确认后入库
 */

import type { ExpertProfile, SquadProfile, ExpertTool } from '../types.js';
import type { ExpertPool } from '../pool/expert-pool.js';
import type { LLMAdapter, LLMMessage } from '../llm-adapter.js';
import type { MonitorStore } from '../monitor/monitor-store.js';

// ============================================================
// 创造会话状态
// ============================================================

export type CreateSessionType = 'expert' | 'squad';

export interface CreateSession {
  id: string;
  type: CreateSessionType;
  /** 对话历史（用于上下文） */
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** 当前正在构建的档案（草稿） */
  draft?: Partial<ExpertProfile> | Partial<SquadProfile>;
  /** 状态 */
  status: 'gathering' | 'confirming' | 'done';
}

// ============================================================
// 创造模式引擎
// ============================================================

export class CreateEngine {
  private pool: ExpertPool;
  private llm?: LLMAdapter;
  private monitor?: MonitorStore;
  private sessions: Map<string, CreateSession> = new Map();

  constructor(pool: ExpertPool, llm?: LLMAdapter, monitor?: MonitorStore) {
    this.pool = pool;
    this.llm = llm;
    this.monitor = monitor;
  }

  /** 注入 LLM 适配器（可在初始化后延迟注入） */
  setLLM(llm: LLMAdapter): void {
    this.llm = llm;
  }

  /** 开始创造会话 */
  startSession(type: CreateSessionType): CreateSession {
    const id = `create_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: CreateSession = {
      id,
      type,
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt(type),
        },
      ],
      status: 'gathering',
    };
    this.sessions.set(id, session);
    return session;
  }

  /** 获取会话 */
  getSession(id: string): CreateSession | undefined {
    return this.sessions.get(id);
  }

  /** 添加用户消息并生成 AI 回复 */
  async addMessage(
    sessionId: string,
    userContent: string
  ): Promise<{ reply: string; draft?: Partial<ExpertProfile> | Partial<SquadProfile> }> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.messages.push({ role: 'user', content: userContent });

    // 调用 LLM 生成回复（此处定义接口，实际由 dsh ctx 调用）
    const reply = await this.generateReply(session);
    session.messages.push({ role: 'assistant', content: reply });

    // 检查是否可以从回复中提取档案
    if (session.status === 'gathering') {
      const extracted = this.tryExtractProfile(session);
      if (extracted) {
        session.draft = extracted;
        session.status = 'confirming';
      }
    }

    return { reply, draft: session.draft };
  }

  /** 确认并保存专家档案 */
  confirmExpert(sessionId: string): ExpertProfile {
    const session = this.sessions.get(sessionId);
    if (!session || session.type !== 'expert') {
      throw new Error('No expert draft to confirm');
    }

    const draft = session.draft as Partial<ExpertProfile>;
    const now = new Date().toISOString();

    const profile: ExpertProfile = {
      id: draft.id ?? this.generateId('expert', draft.identity?.name ?? 'unknown'),
      version: 1,
      createdAt: now,
      updatedAt: now,
      identity: draft.identity ?? { name: '未命名专家', tagline: '' },
      persona: draft.persona ?? { personality: '', stance: '', domains: [] },
      methodology: draft.methodology ?? { workflow: [], deliveryStandard: '' },
      skills: draft.skills ?? [],
      tools: draft.tools ?? [],
      tags: draft.tags ?? [],
      modelConfig: draft.modelConfig,
    };

    this.pool.createExpert(profile);
    this.monitor?.recordExpertCreate(profile.id, profile.identity.name);
    session.status = 'done';
    return profile;
  }

  /** 确认并保存专家团档案 */
  confirmSquad(sessionId: string): SquadProfile {
    const session = this.sessions.get(sessionId);
    if (!session || session.type !== 'squad') {
      throw new Error('No squad draft to confirm');
    }

    const draft = session.draft as Partial<SquadProfile>;
    const now = new Date().toISOString();

    const profile: SquadProfile = {
      id: draft.id ?? this.generateId('squad', draft.teamInfo?.name ?? 'unknown'),
      version: 1,
      createdAt: now,
      updatedAt: now,
      teamInfo: draft.teamInfo ?? { name: '未命名团队', mission: '', goal: '' },
      members: draft.members ?? [],
      tags: draft.tags ?? [],
    };

    this.pool.createSquad(profile);
    session.status = 'done';
    return profile;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private getSystemPrompt(type: CreateSessionType): string {
    if (type === 'expert') {
      return `你是「专家工作室」的创造助手。用户将通过对话创建一个专家档案。

你需要收集以下信息（可以分步询问，不必一次问完）：
1. 专家名字和一句话简介
2. 角色性格、立场、擅长领域
3. 工作流程（2-5 步）和交付标准
4. 技能清单（具体能力列表）
5. 可选：绑定道具（如 Obsidian 记忆库路径）
6. 可选：模型偏好（默认模型、成本档位）

当信息足够时，生成完整的专家档案 YAML 并用 [CONFIRM] 标记。
用户可以修改任意字段后再确认。`;
    } else {
      return `你是「专家工作室」的创造助手。用户将通过对话创建一个专家团。

你需要收集以下信息：
1. 团队名称、使命、目标
2. 团队成员（引用已有专家 ID + 角色分工）
   - 先用 list_experts 工具查看已有专家池
   - 如果缺少某类专家，建议用户先在创造模式创建
3. 成员间的协作方式（并行/串行）

当信息足够时，生成完整的专家团档案 YAML 并用 [CONFIRM] 标记。`;
    }
  }

  private async generateReply(session: CreateSession): Promise<string> {
    const lastMsg = session.messages[session.messages.length - 1];

    // 如果有 LLM 适配器，调用真实的 LLM
    if (this.llm) {
      const messages: LLMMessage[] = session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const response = await this.llm.chat(messages, { temperature: 0.7 });
        return response.content;
      } catch (err: any) {
        return `[LLM Error] ${err.message}\n\n请重试或手动描述你想要的专家。`;
      }
    }

    // 降级：无 LLM 时使用固定引导
    if (session.messages.length <= 2) {
      if (session.type === 'expert') {
        return `好的，让我们开始创建一位新专家！\n\n请告诉我：\n- 这位专家擅长什么领域？\n- 你希望 TA 是什么风格？（严谨/创意/务实/...）\n- TA 主要帮你完成什么类型的任务？\n\n你可以简单描述，我来帮你整理成完整档案。`;
      } else {
        const experts = this.pool.listExperts();
        let expertList = '当前专家池：\n';
        if (experts.length === 0) {
          expertList = '（专家池为空，建议先创建几位专家）\n';
        } else {
          experts.forEach((e) => {
            expertList += `  - ${e.name}（${e.id}）: ${e.tagline}\n`;
          });
        }
        return `${expertList}\n请告诉我：\n- 这个团队要完成什么任务？\n- 需要哪几类专家？`;
      }
    }

    return `[LLM 未接入] 请在 dsh 运行时环境中使用，或注入 LLM 适配器。\n用户说：${lastMsg.content}`;
  }

  /** 尝试从对话中提取专家档案（简化版，实际应调用 LLM 解析） */
  private tryExtractProfile(session: CreateSession): Partial<ExpertProfile> | null {
    const lastReply = session.messages[session.messages.length - 1]?.content ?? '';

    // 检查是否有 [CONFIRM] 标记
    if (!lastReply.includes('[CONFIRM]')) return null;

    // 尝试解析 YAML 块
    const yamlMatch = lastReply.match(/```ya?ml\n([\s\S]*?)\n```/);
    if (!yamlMatch) return null;

    // 简化处理：返回基本信息
    return {
      identity: { name: '待解析', tagline: '待解析' },
      persona: { personality: '', stance: '', domains: [] },
      methodology: { workflow: [], deliveryStandard: '' },
      skills: [],
      tools: [],
      tags: [],
    };
  }

  private generateId(prefix: string, name: string): string {
    const safe = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const seq = Date.now().toString(36);
    return `${prefix}_${safe}_${seq}`;
  }
}
