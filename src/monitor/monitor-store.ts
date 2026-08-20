/**
 * 监控数据存储 - 跟踪所有活动和统计信息
 */

import * as fs from 'fs';
import * as path from 'path';

export interface MonitorEvent {
  timestamp: string;
  type: 'task' | 'expert_create' | 'expert_use' | 'llm_call' | 'error' | 'info';
  expertId?: string;
  expertName?: string;
  taskId?: string;
  taskDescription?: string;
  model?: string;
  provider?: string;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  duration?: number;
  status?: 'success' | 'failed' | 'running';
  message?: string;
}

export interface DailyStats {
  date: string;
  totalTokens: number;
  totalTasks: number;
  successRate: number;
  avgDuration: number;
  topExperts: Array<{ id: string; name: string; count: number }>;
  modelUsage: Array<{ model: string; tokens: number; calls: number }>;
}

export class MonitorStore {
  private events: MonitorEvent[] = [];
  private dataDir: string;
  private maxEvents = 10000; // 最多保留1万条事件

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.load();
  }

  /** 加载历史数据 */
  private load(): void {
    const filePath = path.join(this.dataDir, 'monitor_events.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        this.events = JSON.parse(data);
      }
    } catch (err) {
      console.error('[MonitorStore] 加载监控数据失败:', err);
      this.events = [];
    }
  }

  /** 保存数据到文件 */
  private save(): void {
    const filePath = path.join(this.dataDir, 'monitor_events.json');
    try {
      // 只保留最近的 maxEvents 条
      if (this.events.length > this.maxEvents) {
        this.events = this.events.slice(-this.maxEvents);
      }
      fs.writeFileSync(filePath, JSON.stringify(this.events, null, 2), 'utf-8');
    } catch (err) {
      console.error('[MonitorStore] 保存监控数据失败:', err);
    }
  }

  /** 记录事件 */
  record(event: Omit<MonitorEvent, 'timestamp'>): void {
    this.events.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
    this.save();
  }

  /** 记录 LLM 调用 */
  recordLLMCall(params: {
    expertId: string;
    expertName: string;
    model: string;
    provider: string;
    tokenUsage: { input: number; output: number; total: number };
    duration: number;
    status: 'success' | 'failed';
  }): void {
    this.record({
      type: 'llm_call',
      ...params,
    });
  }

  /** 记录任务执行 */
  recordTask(params: {
    taskId: string;
    expertId: string;
    expertName: string;
    description: string;
    duration: number;
    status: 'success' | 'failed' | 'running';
    tokenUsage?: { input: number; output: number; total: number };
  }): void {
    this.record({
      type: 'task',
      ...params,
    });
  }

  /** 记录专家创建 */
  recordExpertCreate(expertId: string, expertName: string): void {
    this.record({
      type: 'expert_create',
      expertId,
      expertName,
      message: `创建专家: ${expertName}`,
    });
  }

  /** 记录错误 */
  recordError(message: string, expertId?: string): void {
    this.record({
      type: 'error',
      expertId,
      message,
    });
  }

  /** 获取所有事件 */
  getEvents(limit = 100): MonitorEvent[] {
    return this.events.slice(-limit).reverse();
  }

  /** 获取今日统计 */
  getTodayStats(): DailyStats {
    const today = new Date().toISOString().split('T')[0];
    const todayEvents = this.events.filter((e) => e.timestamp.startsWith(today));

    const llmCalls = todayEvents.filter((e) => e.type === 'llm_call');
    const tasks = todayEvents.filter((e) => e.type === 'task');
    const successTasks = tasks.filter((t) => t.status === 'success');

    // Token 总量
    const totalTokens = llmCalls.reduce((sum, e) => sum + (e.tokenUsage?.total || 0), 0);

    // 成功率
    const successRate = tasks.length > 0 ? (successTasks.length / tasks.length) * 100 : 0;

    // 平均耗时
    const completedTasks = tasks.filter((t) => t.duration && t.duration > 0);
    const avgDuration =
      completedTasks.length > 0
        ? completedTasks.reduce((sum, t) => sum + (t.duration || 0), 0) / completedTasks.length
        : 0;

    // Top 专家
    const expertMap = new Map<string, { id: string; name: string; count: number }>();
    tasks.forEach((t) => {
      if (t.expertId && t.expertName) {
        const existing = expertMap.get(t.expertId);
        if (existing) {
          existing.count++;
        } else {
          expertMap.set(t.expertId, { id: t.expertId, name: t.expertName, count: 1 });
        }
      }
    });
    const topExperts = Array.from(expertMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 模型使用统计
    const modelMap = new Map<string, { model: string; tokens: number; calls: number }>();
    llmCalls.forEach((e) => {
      if (e.model) {
        const existing = modelMap.get(e.model);
        if (existing) {
          existing.tokens += e.tokenUsage?.total || 0;
          existing.calls++;
        } else {
          modelMap.set(e.model, {
            model: e.model,
            tokens: e.tokenUsage?.total || 0,
            calls: 1,
          });
        }
      }
    });
    const modelUsage = Array.from(modelMap.values()).sort((a, b) => b.tokens - a.tokens);

    return {
      date: today,
      totalTokens,
      totalTasks: tasks.length,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: Math.round(avgDuration),
      topExperts,
      modelUsage,
    };
  }

  /** 获取最近 N 天的统计 */
  getRecentStats(days = 7): DailyStats[] {
    const stats: DailyStats[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayEvents = this.events.filter((e) => e.timestamp.startsWith(dateStr));

      const llmCalls = dayEvents.filter((e) => e.type === 'llm_call');
      const tasks = dayEvents.filter((e) => e.type === 'task');
      const successTasks = tasks.filter((t) => t.status === 'success');

      const totalTokens = llmCalls.reduce((sum, e) => sum + (e.tokenUsage?.total || 0), 0);
      const successRate = tasks.length > 0 ? (successTasks.length / tasks.length) * 100 : 0;
      const completedTasks = tasks.filter((t) => t.duration && t.duration > 0);
      const avgDuration =
        completedTasks.length > 0
          ? completedTasks.reduce((sum, t) => sum + (t.duration || 0), 0) / completedTasks.length
          : 0;

      stats.push({
        date: dateStr,
        totalTokens,
        totalTasks: tasks.length,
        successRate: Math.round(successRate * 100) / 100,
        avgDuration: Math.round(avgDuration),
        topExperts: [],
        modelUsage: [],
      });
    }
    return stats.reverse();
  }

  /** 获取汇总统计 */
  getSummary(): {
    totalEvents: number;
    totalTokens: number;
    totalTasks: number;
    totalExperts: number;
    uptime: string;
  } {
    const totalTokens = this.events
      .filter((e) => e.type === 'llm_call')
      .reduce((sum, e) => sum + (e.tokenUsage?.total || 0), 0);

    const totalTasks = this.events.filter((e) => e.type === 'task').length;
    const uniqueExperts = new Set(
      this.events.filter((e) => e.expertId).map((e) => e.expertId!)
    ).size;

    // 计算运行时间
    const firstEvent = this.events[0];
    const uptime = firstEvent
      ? this.formatDuration(Date.now() - new Date(firstEvent.timestamp).getTime())
      : '0s';

    return {
      totalEvents: this.events.length,
      totalTokens,
      totalTasks,
      totalExperts: uniqueExperts,
      uptime,
    };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /** 清空所有数据 */
  clear(): void {
    this.events = [];
    this.save();
  }
}
