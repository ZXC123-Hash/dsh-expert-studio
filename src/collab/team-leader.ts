/**
 * 协作模式 — 团长调度引擎
 * 核心：接收用户目标 → 拆解任务 → 分配专家 → 并行/串行执行 → 整合交付
 */

import type {
  ExpertProfile,
  SquadProfile,
  TaskPlan,
  TaskAssignment,
  TaskResult,
  MonitorSnapshot,
} from '../types.js';
import type { ExpertPool } from '../pool/expert-pool.js';
import type { LLMAdapter, LLMMessage } from '../llm-adapter.js';

// ============================================================
// 协作会话
// ============================================================

export interface CollabSession {
  id: string;
  /** 用户原始目标 */
  goal: string;
  /** 选定的专家团（可选） */
  squadId?: string;
  /** 临时选定的专家 ID 列表 */
  selectedExperts: string[];
  /** 任务计划 */
  plan?: TaskPlan;
  /** 各任务执行结果 */
  results: Map<string, TaskResult>;
  /** 状态 */
  status: 'selecting' | 'planning' | 'running' | 'completed' | 'failed';
  /** 监控快照 */
  monitor: MonitorSnapshot;
}

// ============================================================
// 团长调度引擎
// ============================================================

export class TeamLeader {
  private pool: ExpertPool;
  private llm?: LLMAdapter;
  private sessions: Map<string, CollabSession> = new Map();

  constructor(pool: ExpertPool, llm?: LLMAdapter) {
    this.pool = pool;
    this.llm = llm;
  }

  /** 注入 LLM 适配器 */
  setLLM(llm: LLMAdapter): void {
    this.llm = llm;
  }

  /** 开始协作会话 */
  startSession(goal: string): CollabSession {
    const id = `collab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: CollabSession = {
      id,
      goal,
      selectedExperts: [],
      results: new Map(),
      status: 'selecting',
      monitor: {
        timestamp: new Date().toISOString(),
        members: [],
        summary: { totalInput: 0, totalOutput: 0, totalTokens: 0, activeMembers: 0 },
      },
    };
    this.sessions.set(id, session);
    return session;
  }

  /** 获取会话 */
  getSession(id: string): CollabSession | undefined {
    return this.sessions.get(id);
  }

  /** 选择专家团或手动选择专家 */
  selectTeam(sessionId: string, squadId?: string, expertIds?: string[]): CollabSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    if (squadId) {
      const squad = this.pool.getSquad(squadId);
      if (!squad) throw new Error(`Squad not found: ${squadId}`);
      session.squadId = squadId;
      session.selectedExperts = squad.members.map((m) => m.expertId);
    } else if (expertIds) {
      // 验证所有专家存在
      for (const id of expertIds) {
        if (!this.pool.getExpert(id)) {
          throw new Error(`Expert not found: ${id}`);
        }
      }
      session.selectedExperts = expertIds;
    }

    return session;
  }

  /**
   * 团长规划：将用户目标拆解为任务分配
   * 实际实现中调用 LLM 进行任务分解
   */
  async planTasks(sessionId: string): Promise<TaskPlan> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.selectedExperts.length === 0) {
      throw new Error('No experts selected');
    }

    // 收集专家信息供团长参考
    const expertInfos: ExpertProfile[] = [];
    for (const expertId of session.selectedExperts) {
      const expert = this.pool.getExpert(expertId);
      if (expert) expertInfos.push(expert);
    }

    // 生成任务计划（需要 LLM 集成）
    const plan: TaskPlan = {
      id: `plan_${Date.now()}`,
      goal: session.goal,
      squadId: session.squadId,
      assignments: await this.generateAssignments(session.goal, expertInfos),
      status: 'planning',
    };

    session.plan = plan;
    session.status = 'planning';
    return plan;
  }

  /**
   * 执行任务计划
   * 按依赖关系进行并行/串行调度
   */
  async executePlan(sessionId: string): Promise<TaskResult[]> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.plan) throw new Error('No plan to execute');

    session.status = 'running';
    session.plan.status = 'running';

    const results: TaskResult[] = [];
    const completed = new Set<string>();

    // 拓扑排序执行
    while (completed.size < session.plan.assignments.length) {
      // 找到所有依赖已完成的任务
      const ready = session.plan.assignments.filter(
        (a) =>
          !completed.has(a.taskId) &&
          a.dependsOn.every((dep) => completed.has(dep))
      );

      if (ready.length === 0 && completed.size < session.plan.assignments.length) {
        // 死锁检测
        session.status = 'failed';
        session.plan.status = 'failed';
        throw new Error('Deadlock detected in task dependencies');
      }

      // 并行执行就绪任务
      const batch = await Promise.allSettled(
        ready.map((assignment) => this.executeTask(session, assignment))
      );

      for (let i = 0; i < batch.length; i++) {
        const result = batch[i];
        const assignment = ready[i];

        if (result.status === 'fulfilled') {
          results.push(result.value);
          session.results.set(assignment.taskId, result.value);
        } else {
          results.push({
            assignmentId: assignment.taskId,
            expertId: assignment.expertId,
            status: 'failed',
            output: `Error: ${result.reason}`,
            tokenUsage: { input: 0, output: 0, total: 0 },
            model: '',
            provider: '',
            durationMs: 0,
          });
        }
        completed.add(assignment.taskId);
      }

      // 更新监控
      this.updateMonitor(session, results);
    }

    session.status = 'completed';
    session.plan.status = 'completed';
    return results;
  }

  /** 整合所有结果生成最终交付 */
  async synthesizeResults(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const allResults = Array.from(session.results.values());
    const experts = session.selectedExperts.map((id) => this.pool.getExpert(id)).filter(Boolean);

    // 需要 LLM 整合（此处为占位实现）
    const summary = allResults
      .map((r) => {
        const expert = experts.find((e) => e?.id === r.expertId);
        return `## ${expert?.identity.name ?? r.expertId}\n\n${r.output}`;
      })
      .join('\n\n---\n\n');

    return `# 协作结果：${session.goal}\n\n${summary}\n\n---\n*Token 总计: ${session.monitor.summary.totalTokens}*`;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private async generateAssignments(
    goal: string,
    experts: ExpertProfile[]
  ): Promise<TaskAssignment[]> {
    // 如果有 LLM，让团长智能分解任务
    if (this.llm) {
      const expertSummary = experts.map((e) =>
        `- ${e.identity.name}（${e.id}）：擅长 ${e.persona.domains.join('、')}，技能：${e.skills.join('、')}`
      ).join('\n');

      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: `你是多专家协作的团长。你的任务是把用户目标拆解为子任务，分配给合适的专家。
可用专家：
${expertSummary}

请输出 JSON 数组，每个元素包含：
- taskId: "task_0" 格式
- expertId: 分配的专家 ID
- description: 具体任务描述（结合该专家的专业领域）
- dependsOn: 依赖的其他 taskId 数组（无依赖则为 []）
- priority: 数字（越小越高）

只输出 JSON，不要其他文字。`,
        },
        { role: 'user', content: `目标：${goal}` },
      ];

      try {
        const response = await this.llm.chat(messages, { temperature: 0.3 });
        const parsed = JSON.parse(response.content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any, i: number) => ({
            taskId: item.taskId || `task_${i}`,
            expertId: item.expertId || experts[i % experts.length].id,
            description: item.description || '',
            dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn : [],
            priority: item.priority ?? i,
          }));
        }
      } catch (err: any) {
        console.warn(`[TeamLeader] LLM task generation failed, using fallback: ${err.message}`);
      }
    }

    // 降级：每个专家分配一个子任务，全部并行
    return experts.map((expert, index) => ({
      taskId: `task_${index}`,
      expertId: expert.id,
      description: `基于你的专业领域「${expert.persona.domains.join(', ')}」，为以下目标贡献你的专业能力：\n\n目标：${goal}`,
      dependsOn: [],
      priority: index,
    }));
  }

  private async executeTask(
    session: CollabSession,
    assignment: TaskAssignment
  ): Promise<TaskResult> {
    const expert = this.pool.getExpert(assignment.expertId);
    if (!expert) {
      throw new Error(`Expert not found: ${assignment.expertId}`);
    }

    const startTime = Date.now();
    let output: string;
    let tokenUsage = { input: 0, output: 0, total: 0 };
    let model = expert.modelConfig?.defaultModel ?? 'default';
    let provider = expert.modelConfig?.providers[0]?.api ?? 'default';

    if (this.llm) {
      // 用专家人设构建 system prompt
      const systemPrompt = [
        `你是「${expert.identity.name}」。`,
        `${expert.identity.tagline}`,
        '',
        `性格：${expert.persona.personality}`,
        `立场：${expert.persona.stance}`,
        `擅长领域：${expert.persona.domains.join('、')}`,
        '',
        `工作流程：`,
        ...expert.methodology.workflow.map((w, i) => `${i + 1}. ${w}`),
        `交付标准：${expert.methodology.deliveryStandard}`,
        '',
        `技能：${expert.skills.join('、')}`,
        '',
        `请严格按照你的角色和方法论完成任务。`,
      ].join('\n');

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: assignment.description },
      ];

      try {
        const response = await this.llm.chat(messages, {
          model: expert.modelConfig?.defaultModel,
          temperature: 0.5,
        });
        output = response.content;
        tokenUsage = response.usage;
        model = response.model;
        provider = response.provider;
      } catch (err: any) {
        output = `[LLM Error] ${err.message}`;
      }
    } else {
      output = `[LLM 未接入] 请在 dsh 运行时环境中使用。\n\n专家：${expert.identity.name}\n领域：${expert.persona.domains.join(', ')}\n任务：${assignment.description}`;
    }

    const duration = Date.now() - startTime;

    return {
      assignmentId: assignment.taskId,
      expertId: expert.id,
      status: 'success',
      output,
      tokenUsage,
      model,
      provider,
      durationMs: duration,
    };
  }

  private updateMonitor(session: CollabSession, results: TaskResult[]): void {
    const members = results.map((r) => {
      const expert = this.pool.getExpert(r.expertId);
      const monitorStatus = r.status === 'success' ? 'completed' : r.status === 'failed' ? 'failed' : 'idle';
      return {
        expertId: r.expertId,
        expertName: expert?.identity.name ?? r.expertId,
        model: r.model,
        provider: r.provider,
        tokenUsage: r.tokenUsage,
        status: monitorStatus as 'idle' | 'running' | 'completed' | 'failed',
      };
    });

    const totalInput = members.reduce((sum, m) => sum + m.tokenUsage.input, 0);
    const totalOutput = members.reduce((sum, m) => sum + m.tokenUsage.output, 0);

    session.monitor = {
      timestamp: new Date().toISOString(),
      members,
      summary: {
        totalInput,
        totalOutput,
        totalTokens: totalInput + totalOutput,
        activeMembers: members.filter((m) => m.status === 'running').length,
      },
    };
  }
}
