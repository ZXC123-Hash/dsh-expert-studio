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
  private sessions: Map<string, CollabSession> = new Map();

  constructor(pool: ExpertPool) {
    this.pool = pool;
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
    // 注意：实际需要调用 LLM 进行智能任务分解
    // 当前为简化版：每个专家分配一个子任务

    return experts.map((expert, index) => ({
      taskId: `task_${index}`,
      expertId: expert.id,
      description: `基于你的专业领域「${expert.persona.domains.join(', ')}」，为以下目标贡献你的专业能力：\n\n目标：${goal}`,
      dependsOn: [], // 简化版：全部并行
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

    // 注意：实际需要调用 dsh ctx.llm 以专家人设执行任务
    // 当前为占位实现
    const output = `[PENDING_LLM] 需要 dsh ctx.llm 接口。\n\n专家：${expert.identity.name}\n领域：${expert.persona.domains.join(', ')}\n任务：${assignment.description}`;

    const duration = Date.now() - startTime;

    return {
      assignmentId: assignment.taskId,
      expertId: expert.id,
      status: 'success',
      output,
      tokenUsage: { input: 0, output: 0, total: 0 },
      model: expert.modelConfig?.defaultModel ?? 'default',
      provider: expert.modelConfig?.providers[0]?.api ?? 'default',
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
