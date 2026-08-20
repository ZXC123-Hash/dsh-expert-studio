/**
 * dsh-expert-studio — 插件入口
 * 
 * DeepSeek Harness 多Agent协作工作室插件
 * 提供「创造模式」和「协作模式」两个自定义预设
 * 
 * 四层架构：
 *   入口层 → 预设选择器（创造/协作模式）
 *   存储层 → 专家池（文件型 YAML CRUD）
 *   协作层 → 团长调度引擎
 *   能力层 → 动态工具注入
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { ExpertPool } from './pool/expert-pool.js';
import { CreateEngine } from './create/create-engine.js';
import { TeamLeader } from './collab/team-leader.js';
import { registerAllTools, type ToolDefinition } from './tools/register-tools.js';
import { ObsidianVault } from './tools/ob-vault.js';
import { MemoryBus } from './memory/memory-bus.js';
import { createDshLLMAdapter, type LLMAdapter } from './llm-adapter.js';
import { MonitorStore } from './monitor/monitor-store.js';
import { MonitorServer } from './monitor/server.js';

// ============================================================
// 插件导出（dsh plugin 格式）
// ============================================================

export const name = 'dsh-expert-studio';

/**
 * 插件 apply 函数
 * dsh 会在加载插件时调用此函数，传入 Cordis 上下文
 */
export function apply(ctx: any): void {
  // ── 初始化存储路径 ──
  const dshHome = process.env.DSH_HOME || path.join(process.env.HOME || '~', '.dsh');
  const poolPath = path.join(dshHome, 'expert-studio', 'pool');

  // 确保目录存在
  fs.mkdirSync(poolPath, { recursive: true });

  // ── 初始化核心存储 ──
  const pool = new ExpertPool(poolPath);

  // ── 初始化监控 ──
  const monitorDir = path.join(dshHome, 'expert-studio', 'monitor');
  fs.mkdirSync(monitorDir, { recursive: true });
  const monitorStore = new MonitorStore(monitorDir);
  const monitorPort = parseInt(process.env.DSH_MONITOR_PORT || '7890', 10);
  const monitorServer = new MonitorServer(monitorStore, pool, monitorPort);
  monitorServer.start();

  // ── 初始化 LLM 适配器 ──
  const llm = createDshLLMAdapter(ctx, process.env.DSH_DEFAULT_MODEL);

  // ── 初始化引擎 ──
  const createEngine = new CreateEngine(pool, llm, monitorStore);
  const teamLeader = new TeamLeader(pool, llm, monitorStore);

  // ── 初始化可选道具 ──
  let obVault: ObsidianVault | undefined;
  let memoryBus: MemoryBus | undefined;

  // OB 记忆库（如果配置了 vault 路径）
  const obVaultPath = process.env.DSH_OB_VAULT_PATH;
  if (obVaultPath) {
    try {
      obVault = new ObsidianVault(obVaultPath);
      console.log(`[dsh-expert-studio] OB Vault loaded: ${obVaultPath}`);
    } catch (err) {
      console.warn(`[dsh-expert-studio] OB Vault init failed: ${err}`);
    }
  }

  // 记忆压缩层
  const enableMemoryBus = process.env.DSH_MEMORY_BUS !== 'false';
  if (enableMemoryBus) {
    const memBusPath = path.join(dshHome, 'expert-studio', 'memory-bus');
    memoryBus = new MemoryBus({
      storagePath: memBusPath,
      defaultNamespace: 'default',
    });
  }

  // ── 注册工具 ──
  const tools = registerAllTools(pool, createEngine, teamLeader, obVault, memoryBus, monitorStore);

  for (const tool of tools) {
    // 使用 dsh defineTool 风格注册
    ctx.tools.register(
      defineTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        handler: tool.handler,
      })
    );
  }

  // ── 注册预设 ──
  // 创造模式预设
  ctx.presets?.register?.({
    name: 'expert-studio:create',
    displayName: '🧪 专家工作室 · 创造模式',
    description: '通过对话创建/编辑专家与专家团',
    systemPrompt: getCreatePresetPrompt(),
    tools: tools.filter((t) =>
      ['expert_list', 'expert_get', 'expert_search', 'expert_delete',
       'squad_list', 'squad_get',
       'create_start', 'create_message', 'create_confirm'].includes(t.name)
    ).map((t) => t.name),
  });

  // 协作模式预设
  ctx.presets?.register?.({
    name: 'expert-studio:collab',
    displayName: '🤝 专家工作室 · 协作模式',
    description: '选择专家/专家团，让团长调度多专家协作完成任务',
    systemPrompt: getCollabPresetPrompt(),
    tools: tools.filter((t) =>
      ['expert_list', 'expert_get', 'expert_search',
       'squad_list', 'squad_get',
       'collab_start', 'collab_plan', 'collab_execute', 'collab_synthesize', 'collab_monitor'].includes(t.name)
    ).map((t) => t.name),
  });

  // ── 生命周期钩子 ──
  ctx.on?.('session:start', () => {
    console.log('[dsh-expert-studio] Session started, expert pool ready.');
  });

  ctx.on?.('session:end', () => {
    monitorServer.stop();
    console.log('[dsh-expert-studio] Session ended.');
  });
}

// ============================================================
// 预设 System Prompt
// ============================================================

function getCreatePresetPrompt(): string {
  return `你是「专家工作室」的创造模式助手。

你的职责是帮助用户通过对话创建和管理专家与专家团。

## 工作流程

1. 用户说想创建专家 → 调用 create_start(type="expert") 启动会话
2. 与用户对话收集信息 → 调用 create_message 传递用户描述
3. AI 生成专家档案后 → 展示给用户确认
4. 用户确认 → 调用 create_confirm 入库

## 你可以做的事
- 列出/搜索/查看专家详情
- 创建/编辑专家档案
- 创建专家团（从已有专家中选择成员）
- 删除专家

## 专家档案包含
- 身份（名字、简介、头像）
- 人设（性格、立场、擅长领域）
- 方法论（工作流程、交付标准）
- 技能清单
- 道具（可选绑定 Obsidian 记忆库等）
- 模型配置（可选，多 API/多模型档位）

请用友好的方式引导用户完成创造过程。`;
}

function getCollabPresetPrompt(): string {
  return `你是「专家工作室」的协作模式助手。

你的职责是帮助用户选择专家/专家团，让团长调度多专家协作完成复杂任务。

## 工作流程

1. 用户描述目标 → 调用 collab_start 启动协作会话
2. 选择专家/专家团 → 通过 squad_id 或 expert_ids 指定
3. 团长规划 → 调用 collab_plan 拆解任务
4. 执行任务 → 调用 collab_execute 并行/串行调度
5. 整合结果 → 调用 collab_synthesize 生成最终交付
6. 查看监控 → 调用 collab_monitor 查看 Token 消耗

## 你可以做的事
- 浏览专家池和专家团
- 启动协作会话
- 让团长拆解任务、调度专家
- 查看实时 Token 监控

## 调度原则
- 无依赖的任务并行执行
- 有依赖的任务按序执行
- 团长负责拆解、分配、监控
- 各专家在各自领域内独立完成子任务

请高效地帮助用户完成多专家协作。`;
}

// ============================================================
// defineTool 辅助（兼容 dsh ctx.tools.register 格式）
// ============================================================

function defineTool(config: {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}) {
  return {
    name: config.name,
    description: config.description,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(config.parameters).map(([key, param]) => [
          key,
          {
            type: param.type,
            description: param.description,
            ...(param.enum ? { enum: param.enum } : {}),
          },
        ])
      ),
      required: Object.entries(config.parameters)
        .filter(([, p]) => p.required)
        .map(([k]) => k),
    },
    execute: config.handler,
  };
}

// ============================================================
// 导出类型和模块
// ============================================================

export type { ExpertProfile, SquadProfile, PoolIndex, TaskPlan, TaskResult, MonitorSnapshot } from './types.js';
export { ExpertPool } from './pool/expert-pool.js';
export { CreateEngine } from './create/create-engine.js';
export { TeamLeader } from './collab/team-leader.js';
export { ObsidianVault } from './tools/ob-vault.js';
export { MemoryBus } from './memory/memory-bus.js';
export { MonitorStore } from './monitor/monitor-store.js';
export { MonitorServer } from './monitor/server.js';
