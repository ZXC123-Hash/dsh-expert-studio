/**
 * 记忆压缩层 — 专家间共享的结构化记忆总线
 * 
 * 解决问题：多专家协作时每个专家都重读全量文件，token 浪费大
 * 方案：把长内容压缩为结构化 observation，按需召回，省 60-90% 上下文 token
 * 
 * 当前实现：JSON 文件存储（轻量版，后续可升级到 SQLite+FTS5）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================
// 类型
// ============================================================

export interface Observation {
  id: string;
  /** 来源专家 ID */
  sourceExpertId: string;
  /** 命名空间（按项目/会话隔离） */
  namespace: string;
  /** 压缩后的要点摘要 */
  summary: string;
  /** 关键事实/数据点 */
  keyFacts: string[];
  /** 来源笔记路径（可回查原文） */
  sourcePath?: string;
  /** 创建时间 */
  createdAt: string;
  /** 关联标签 */
  tags: string[];
  /** 引用次数（越常用越靠前） */
  accessCount: number;
}

export interface MemoryBusConfig {
  /** 存储目录 */
  storagePath: string;
  /** 默认命名空间 */
  defaultNamespace: string;
}

// ============================================================
// 记忆总线
// ============================================================

export class MemoryBus {
  private storagePath: string;
  private defaultNamespace: string;
  private cache: Map<string, Observation[]> = new Map();

  constructor(config: MemoryBusConfig) {
    this.storagePath = config.storagePath;
    this.defaultNamespace = config.defaultNamespace;
    fs.mkdirSync(this.storagePath, { recursive: true });
  }

  /** 存储一条 observation */
  store(obs: Omit<Observation, 'id' | 'createdAt' | 'accessCount'>): Observation {
    const observation: Observation = {
      ...obs,
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      accessCount: 0,
    };

    const nsPath = this.getNsPath(obs.namespace);
    const existing = this.loadAll(obs.namespace);
    existing.push(observation);
    fs.writeFileSync(nsPath, JSON.stringify(existing, null, 2), 'utf-8');
    this.cache.set(obs.namespace, existing);

    return observation;
  }

  /** 批量存储（一次任务完成后批量写入） */
  storeBatch(observations: Array<Omit<Observation, 'id' | 'createdAt' | 'accessCount'>>): Observation[] {
    return observations.map((obs) => this.store(obs));
  }

  /** 按关键词召回 observation */
  recall(namespace: string, query: string, maxResults: number = 10): Observation[] {
    const all = this.loadAll(namespace);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    // 评分
    const scored = all.map((obs) => {
      let score = 0;
      const text = `${obs.summary} ${obs.keyFacts.join(' ')} ${obs.tags.join(' ')}`.toLowerCase();

      for (const word of queryWords) {
        if (text.includes(word)) score += 1;
      }

      // 常用 observation 加分
      score += Math.log(obs.accessCount + 1) * 0.5;

      return { obs, score };
    });

    // 排序并取 top N
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, maxResults).map((s) => s.obs);

    // 更新访问计数
    for (const obs of results) {
      obs.accessCount++;
    }
    if (results.length > 0) {
      const nsPath = this.getNsPath(namespace);
      fs.writeFileSync(nsPath, JSON.stringify(all, null, 2), 'utf-8');
    }

    return results;
  }

  /** 获取命名空间下所有 observation */
  getAll(namespace: string): Observation[] {
    return this.loadAll(namespace);
  }

  /** 按专家 ID 过滤 */
  getByExpert(namespace: string, expertId: string): Observation[] {
    return this.loadAll(namespace).filter((o) => o.sourceExpertId === expertId);
  }

  /** 删除命名空间下所有记忆 */
  clear(namespace: string): number {
    const all = this.loadAll(namespace);
    const count = all.length;
    const nsPath = this.getNsPath(namespace);
    fs.writeFileSync(nsPath, '[]', 'utf-8');
    this.cache.delete(namespace);
    return count;
  }

  /** 获取统计信息 */
  getStats(namespace: string): {
    totalObservations: number;
    experts: string[];
    totalSize: number;
    topTags: Array<{ tag: string; count: number }>;
  } {
    const all = this.loadAll(namespace);
    const experts = [...new Set(all.map((o) => o.sourceExpertId))];
    const tagCount: Record<string, number> = {};

    for (const obs of all) {
      for (const tag of obs.tags) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }

    const topTags = Object.entries(tagCount)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const nsPath = this.getNsPath(namespace);
    const sizeBytes = fs.existsSync(nsPath) ? fs.statSync(nsPath).size : 0;

    return {
      totalObservations: all.length,
      experts,
      totalSize: sizeBytes,
      topTags,
    };
  }

  // ============================================================
  // 内部
  // ============================================================

  private getNsPath(namespace: string): string {
    const safe = namespace.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storagePath, `${safe}.json`);
  }

  private loadAll(namespace: string): Observation[] {
    // 优先读缓存
    if (this.cache.has(namespace)) {
      return this.cache.get(namespace)!;
    }

    const nsPath = this.getNsPath(namespace);
    if (!fs.existsSync(nsPath)) {
      this.cache.set(namespace, []);
      return [];
    }

    try {
      const raw = fs.readFileSync(nsPath, 'utf-8');
      const data = JSON.parse(raw) as Observation[];
      this.cache.set(namespace, data);
      return data;
    } catch {
      this.cache.set(namespace, []);
      return [];
    }
  }
}
