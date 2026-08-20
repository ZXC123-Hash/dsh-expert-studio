/**
 * 注册的工具集 — 提供给 dsh Agent 调用的工具
 */

import type { ExpertPool } from '../pool/expert-pool.js';
import type { CreateEngine } from '../create/create-engine.js';
import type { TeamLeader } from '../collab/team-leader.js';
import type { ObsidianVault } from './ob-vault.js';
import type { MemoryBus } from '../memory/memory-bus.js';

// ============================================================
// 工具定义接口（兼容 dsh defineTool 风格）
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParam>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface ToolParam {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

// ============================================================
// 工具注册表
// ============================================================

export function registerAllTools(
  pool: ExpertPool,
  createEngine: CreateEngine,
  teamLeader: TeamLeader,
  obVault?: ObsidianVault,
  memoryBus?: MemoryBus,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  // ──────────────────────────────────────────
  // 专家池相关工具
  // ──────────────────────────────────────────

  tools.push({
    name: 'expert_list',
    description: '列出专家池中所有专家的摘要信息',
    parameters: {},
    handler: async () => {
      const experts = pool.listExperts();
      if (experts.length === 0) return '专家池为空。使用 expert_create 开始创建第一位专家。';
      return experts
        .map((e) => `• **${e.name}**（${e.id}）\n  ${e.tagline}\n  领域：${e.domains.join(', ')}\n  标签：${e.tags.join(', ')}`)
        .join('\n\n');
    },
  });

  tools.push({
    name: 'expert_get',
    description: '获取指定专家的完整档案信息',
    parameters: {
      expert_id: { type: 'string', description: '专家 ID', required: true },
    },
    handler: async (args) => {
      const expert = pool.getExpert(args.expert_id as string);
      if (!expert) return `未找到专家：${args.expert_id}`;
      return formatExpertDetail(expert);
    },
  });

  tools.push({
    name: 'expert_search',
    description: '按关键词搜索专家（匹配名字、领域、标签）',
    parameters: {
      query: { type: 'string', description: '搜索关键词', required: true },
    },
    handler: async (args) => {
      const results = pool.searchExperts(args.query as string);
      if (results.length === 0) return `未找到匹配「${args.query}」的专家。`;
      return results
        .map((e) => `• ${e.name}（${e.id}）— ${e.tagline}`)
        .join('\n');
    },
  });

  tools.push({
    name: 'expert_delete',
    description: '从专家池中删除指定专家',
    parameters: {
      expert_id: { type: 'string', description: '专家 ID', required: true },
    },
    handler: async (args) => {
      const ok = pool.deleteExpert(args.expert_id as string);
      return ok ? `已删除专家：${args.expert_id}` : `未找到专家：${args.expert_id}`;
    },
  });

  // ──────────────────────────────────────────
  // 专家团相关工具
  // ──────────────────────────────────────────

  tools.push({
    name: 'squad_list',
    description: '列出所有专家团',
    parameters: {},
    handler: async () => {
      const squads = pool.listSquads();
      if (squads.length === 0) return '暂无专家团。使用 squad_create 创建。';
      return squads
        .map((s) => `• **${s.name}**（${s.id}）\n  使命：${s.mission}\n  成员数：${s.memberCount}`)
        .join('\n\n');
    },
  });

  tools.push({
    name: 'squad_get',
    description: '获取指定专家团的完整信息',
    parameters: {
      squad_id: { type: 'string', description: '专家团 ID', required: true },
    },
    handler: async (args) => {
      const squad = pool.getSquad(args.squad_id as string);
      if (!squad) return `未找到专家团：${args.squad_id}`;
      return formatSquadDetail(squad);
    },
  });

  // ──────────────────────────────────────────
  // 创造模式工具
  // ──────────────────────────────────────────

  tools.push({
    name: 'create_start',
    description: '开始创造模式会话（创建专家或专家团）',
    parameters: {
      type: {
        type: 'string',
        description: '创造类型：expert（专家）或 squad（专家团）',
        required: true,
        enum: ['expert', 'squad'],
      },
    },
    handler: async (args) => {
      const session = createEngine.startSession(args.type as 'expert' | 'squad');
      return `创造会话已启动（${session.id}）。\n\n${session.messages[0].content}`;
    },
  });

  tools.push({
    name: 'create_message',
    description: '在创造会话中发送消息（与创造 AI 对话）',
    parameters: {
      session_id: { type: 'string', description: '创造会话 ID', required: true },
      message: { type: 'string', description: '用户消息', required: true },
    },
    handler: async (args) => {
      const result = await createEngine.addMessage(
        args.session_id as string,
        args.message as string
      );
      let reply = result.reply;
      if (result.draft) {
        reply += '\n\n📋 档案草稿已生成，使用 create_confirm 确认后入库。';
      }
      return reply;
    },
  });

  tools.push({
    name: 'create_confirm',
    description: '确认创造会话中的档案草稿，保存到专家池',
    parameters: {
      session_id: { type: 'string', description: '创造会话 ID', required: true },
    },
    handler: async (args) => {
      const session = createEngine.getSession(args.session_id as string);
      if (!session) return `会话不存在：${args.session_id}`;
      try {
        if (session.type === 'expert') {
          const profile = createEngine.confirmExpert(args.session_id as string);
          return `✅ 专家已入库！\n\n**${profile.identity.name}**（${profile.id}）\n${profile.identity.tagline}`;
        } else {
          const profile = createEngine.confirmSquad(args.session_id as string);
          return `✅ 专家团已入库！\n\n**${profile.teamInfo.name}**（${profile.id}）\n${profile.teamInfo.mission}`;
        }
      } catch (err: any) {
        return `❌ 确认失败：${err.message}`;
      }
    },
  });

  // ──────────────────────────────────────────
  // 协作模式工具
  // ──────────────────────────────────────────

  tools.push({
    name: 'collab_start',
    description: '启动协作会话，让多专家协作完成目标',
    parameters: {
      goal: { type: 'string', description: '用户目标描述', required: true },
      squad_id: { type: 'string', description: '可选：指定专家团 ID' },
      expert_ids: {
        type: 'array',
        description: '可选：手动指定专家 ID 列表（不用专家团时）',
      },
    },
    handler: async (args) => {
      const session = teamLeader.startSession(args.goal as string);
      if (args.squad_id) {
        teamLeader.selectTeam(session.id, args.squad_id as string);
      } else if (args.expert_ids) {
        teamLeader.selectTeam(session.id, undefined, args.expert_ids as string[]);
      }
      return `协作会话已启动（${session.id}）。\n目标：${args.goal}\n\n使用 collab_plan 让团长规划任务分配。`;
    },
  });

  tools.push({
    name: 'collab_plan',
    description: '团长规划：将目标拆解为任务并分配给专家',
    parameters: {
      session_id: { type: 'string', description: '协作会话 ID', required: true },
    },
    handler: async (args) => {
      const plan = await teamLeader.planTasks(args.session_id as string);
      const lines = plan.assignments.map(
        (a, i) => `${i + 1}. → ${a.expertId}\n   任务：${a.description.slice(0, 80)}...\n   依赖：${a.dependsOn.length > 0 ? a.dependsOn.join(', ') : '无'}`
      );
      return `📋 任务计划（${plan.id}）\n\n${lines.join('\n')}\n\n使用 collab_execute 开始执行。`;
    },
  });

  tools.push({
    name: 'collab_execute',
    description: '执行任务计划（按依赖关系并行/串行调度）',
    parameters: {
      session_id: { type: 'string', description: '协作会话 ID', required: true },
    },
    handler: async (args) => {
      const results = await teamLeader.executePlan(args.session_id as string);
      const summary = results
        .map((r) => `${r.expertId}: ${r.status} (${r.tokenUsage.total} tokens, ${r.durationMs}ms)`)
        .join('\n');
      return `✅ 执行完成\n\n${summary}\n\n使用 collab_synthesize 整合最终结果。`;
    },
  });

  tools.push({
    name: 'collab_synthesize',
    description: '整合各专家产出为最终交付物',
    parameters: {
      session_id: { type: 'string', description: '协作会话 ID', required: true },
    },
    handler: async (args) => {
      return teamLeader.synthesizeResults(args.session_id as string);
    },
  });

  tools.push({
    name: 'collab_monitor',
    description: '查看当前协作会话的实时监控数据（Token、模型、渠道）',
    parameters: {
      session_id: { type: 'string', description: '协作会话 ID', required: true },
    },
    handler: async (args) => {
      const session = teamLeader.getSession(args.session_id as string);
      if (!session) return `会话不存在：${args.session_id}`;
      const m = session.monitor;
      const lines = m.members.map(
        (mem) => `• ${mem.expertName}：${mem.tokenUsage.total} tokens（模型：${mem.model}，渠道：${mem.provider}，状态：${mem.status}）`
      );
      return `📊 监控面板\n\n${lines.join('\n')}\n\n**汇总**：总 Token ${m.summary.totalTokens}（输入 ${m.summary.totalInput} / 输出 ${m.summary.totalOutput}）`;
    },
  });

  // ──────────────────────────────────────────
  // OB 记忆库道具工具（可选）
  // ──────────────────────────────────────────

  if (obVault) {
    tools.push({
      name: 'ob_list_notes',
      description: '列出 Obsidian 知识库中的所有笔记',
      parameters: {
        subfolder: { type: 'string', description: '可选：子目录路径' },
      },
      handler: async (args) => {
        const notes = obVault.listNotes(args.subfolder as string | undefined);
        if (notes.length === 0) return '知识库中没有找到笔记。';
        return `共 ${notes.length} 篇笔记：\n${notes.map((n) => `• ${n}`).join('\n')}`;
      },
    });

    tools.push({
      name: 'ob_read_note',
      description: '读取 Obsidian 知识库中的指定笔记',
      parameters: {
        path: { type: 'string', description: '笔记相对路径（如 "日记/2026-08-20.md"）', required: true },
      },
      handler: async (args) => {
        const note = obVault.readNote(args.path as string);
        if (!note) return `未找到笔记：${args.path}`;
        return `## ${note.title}\n\n${note.content}\n\n---\n链接：${note.outboundLinks.join(', ') || '无'}\n修改：${note.modifiedAt}`;
      },
    });

    tools.push({
      name: 'ob_write_note',
      description: '在 Obsidian 知识库中创建或更新笔记',
      parameters: {
        path: { type: 'string', description: '笔记相对路径', required: true },
        content: { type: 'string', description: '笔记内容（Markdown）', required: true },
      },
      handler: async (args) => {
        const note = obVault.writeNote(args.path as string, args.content as string);
        return `✅ 笔记已保存：${note.filePath}\n标题：${note.title}\n大小：${note.sizeBytes} 字节`;
      },
    });

    tools.push({
      name: 'ob_search',
      description: '在 Obsidian 知识库中全文搜索',
      parameters: {
        query: { type: 'string', description: '搜索关键词', required: true },
        max_results: { type: 'number', description: '最大结果数（默认20）' },
      },
      handler: async (args) => {
        const results = obVault.searchNotes(args.query as string, {
          maxResults: (args.max_results as number) || 20,
        });
        if (results.length === 0) return `未找到匹配「${args.query}」的笔记。`;
        return results.map((r) => `• **${r.title}**（${r.filePath}）相关度：${(r.score * 100).toFixed(0)}%\n  ${r.snippets[0] || ''}`).join('\n\n');
      },
    });

    tools.push({
      name: 'ob_backlinks',
      description: '查看某篇笔记的反向链接（谁链接到了它）',
      parameters: {
        path: { type: 'string', description: '笔记相对路径', required: true },
      },
      handler: async (args) => {
        const backlinks = obVault.getBacklinks(args.path as string);
        if (backlinks.length === 0) return `没有笔记链接到 ${args.path}`;
        return `以下笔记链接到 ${args.path}：\n${backlinks.map((b) => `• ${b}`).join('\n')}`;
      },
    });

    tools.push({
      name: 'ob_stats',
      description: '查看 Obsidian 知识库统计信息',
      parameters: {},
      handler: async () => {
        const stats = obVault.getStats();
        return `📊 知识库统计\n\n• 笔记总数：${stats.totalNotes}\n• 总大小：${(stats.totalSize / 1024).toFixed(1)} KB\n• 链接总数：${stats.totalLinks}\n• 标签数：${Object.keys(stats.tags).length}\n\n最近修改：\n${stats.recentNotes.map((n) => `• ${n.title}（${n.path}）— ${n.modifiedAt.slice(0, 10)}`).join('\n')}`;
      },
    });
  }

  // ──────────────────────────────────────────
  // 记忆压缩层工具（可选）
  // ──────────────────────────────────────────

  if (memoryBus) {
    tools.push({
      name: 'memory_store',
      description: '存储一条压缩观察（任务完成后的要点摘要，供其他专家快速召回）',
      parameters: {
        namespace: { type: 'string', description: '命名空间（项目/会话ID）', required: true },
        expert_id: { type: 'string', description: '来源专家 ID', required: true },
        summary: { type: 'string', description: '要点摘要', required: true },
        key_facts: { type: 'array', description: '关键事实列表' },
        tags: { type: 'array', description: '标签列表' },
      },
      handler: async (args) => {
        const obs = memoryBus.store({
          namespace: args.namespace as string,
          sourceExpertId: args.expert_id as string,
          summary: args.summary as string,
          keyFacts: (args.key_facts as string[]) || [],
          tags: (args.tags as string[]) || [],
        });
        return `✅ 记忆已存储（${obs.id}）\n摘要：${obs.summary.slice(0, 100)}...`;
      },
    });

    tools.push({
      name: 'memory_recall',
      description: '按关键词召回相关记忆（压缩后的要点，避免重读原文）',
      parameters: {
        namespace: { type: 'string', description: '命名空间', required: true },
        query: { type: 'string', description: '搜索关键词', required: true },
        max_results: { type: 'number', description: '最大结果数（默认10）' },
      },
      handler: async (args) => {
        const results = memoryBus.recall(
          args.namespace as string,
          args.query as string,
          (args.max_results as number) || 10,
        );
        if (results.length === 0) return `命名空间「${args.namespace}」中没有匹配「${args.query}」的记忆。`;
        return results.map((r) => `• [${r.sourceExpertId}] ${r.summary}\n  关键事实：${r.keyFacts.join('; ') || '无'}`).join('\n\n');
      },
    });

    tools.push({
      name: 'memory_stats',
      description: '查看记忆总线统计信息',
      parameters: {
        namespace: { type: 'string', description: '命名空间', required: true },
      },
      handler: async (args) => {
        const stats = memoryBus.getStats(args.namespace as string);
        return `📊 记忆统计（${args.namespace}）\n\n• 观察总数：${stats.totalObservations}\n• 参与专家：${stats.experts.join(', ') || '无'}\n• 存储大小：${(stats.totalSize / 1024).toFixed(1)} KB\n\n热门标签：\n${stats.topTags.map((t) => `• ${t.tag}（${t.count}次）`).join('\n') || '无标签'}`;
      },
    });
  }

  return tools;
}

// ============================================================
// 格式化辅助
// ============================================================

function formatExpertDetail(expert: any): string {
  return [
    `## ${expert.identity.name}（${expert.id}）`,
    `> ${expert.identity.tagline}`,
    '',
    `**性格**：${expert.persona.personality}`,
    `**立场**：${expert.persona.stance}`,
    `**领域**：${expert.persona.domains.join(', ')}`,
    '',
    `**工作流程**：`,
    ...expert.methodology.workflow.map((w: string, i: number) => `  ${i + 1}. ${w}`),
    `**交付标准**：${expert.methodology.deliveryStandard}`,
    '',
    `**技能**：${expert.skills.join(', ')}`,
    `**道具**：${expert.tools.map((t: any) => t.type).join(', ') || '无'}`,
    `**标签**：${expert.tags.join(', ')}`,
  ].join('\n');
}

function formatSquadDetail(squad: any): string {
  return [
    `## ${squad.teamInfo.name}（${squad.id}）`,
    `> 使命：${squad.teamInfo.mission}`,
    `> 目标：${squad.teamInfo.goal}`,
    '',
    `**成员**：`,
    ...squad.members.map((m: any, i: number) => `  ${i + 1}. ${m.expertId} — ${m.role}（${m.parallel ? '并行' : '串行'}）`),
    '',
    `**标签**：${squad.tags.join(', ')}`,
  ].join('\n');
}
