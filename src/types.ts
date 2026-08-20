/**
 * dsh-expert-studio 类型定义
 * 专家档案、专家团档案、模型配置、道具类型
 */

// ============================================================
// 专家档案
// ============================================================

export interface ExpertIdentity {
  /** 专家名字 */
  name: string;
  /** 一句话简介 */
  tagline: string;
  /** 头像（可选，支持 emoji 或 URL） */
  avatar?: string;
}

export interface ExpertPersona {
  /** 角色性格描述 */
  personality: string;
  /** 立场/价值观 */
  stance: string;
  /** 擅长领域列表 */
  domains: string[];
}

export interface ExpertMethodology {
  /** 工作流程（步骤列表） */
  workflow: string[];
  /** 交付标准 */
  deliveryStandard: string;
}

export interface ModelProvider {
  /** 提供商标识（如 deepseek, openai, free_model） */
  api: string;
  /** API base URL */
  baseUrl: string;
  /** API Key（运行时从环境变量或配置读取，不持久化） */
  apiKeyEnv?: string;
}

export interface ModelTier {
  /** 档位名称（强/中/低） */
  tier: 'strong' | 'medium' | 'low';
  /** 对应模型名称 */
  model: string;
  /** 适用场景说明 */
 applicable: string;
}

export type RoutingStrategy = 'auto' | 'manual' | 'default_only';

export interface ExpertModelConfig {
  /** 多个 API 提供商 */
  providers: ModelProvider[];
  /** 默认使用的模型 */
  defaultModel: string;
  /** 成本档位表 */
  tiers: ModelTier[];
  /** 路由策略 */
  routingStrategy: RoutingStrategy;
}

// ============================================================
// 道具类型
// ============================================================

export interface ObsidianMemoryTool {
  type: 'ob_memory';
  config: {
    /** 知识库路径 */
    vaultPath: string;
    /** 访问模式：file = 文件直读 */
    apiMode: 'file' | 'rest';
  };
}

export interface VisionTool {
  type: 'vision';
  config?: Record<string, unknown>;
}

export interface LongTermMemoryTool {
  type: 'longterm_memory';
  config?: {
    /** 记忆存储路径 */
    storagePath?: string;
  };
}

export interface MemoryBusTool {
  type: 'memory_bus';
  config?: {
    /** 命名空间隔离 */
    namespace?: string;
    /** SQLite 存储路径 */
    dbPath?: string;
  };
}

export type ExpertTool = ObsidianMemoryTool | VisionTool | LongTermMemoryTool | MemoryBusTool;

// ============================================================
// 完整专家档案
// ============================================================

export interface ExpertProfile {
  /** 唯一标识（格式：expert_<domain>_<seq>） */
  id: string;
  /** 版本 */
  version: number;
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** 最后修改时间 */
  updatedAt: string;
  /** 身份信息 */
  identity: ExpertIdentity;
  /** 人设 */
  persona: ExpertPersona;
  /** 方法论 */
  methodology: ExpertMethodology;
  /** 技能清单 */
  skills: string[];
  /** 模型配置（可选，默认使用全局配置） */
  modelConfig?: ExpertModelConfig;
  /** 道具列表 */
  tools: ExpertTool[];
  /** 标签（用于搜索和分类） */
  tags: string[];
}

// ============================================================
// 专家团档案
// ============================================================

export interface SquadMember {
  /** 引用的专家 ID */
  expertId: string;
  /** 在团队中的角色分工 */
  role: string;
  /** 是否可被团长并行调度 */
  parallel: boolean;
}

export interface SquadProfile {
  /** 唯一标识（格式：squad_<domain>_<seq>） */
  id: string;
  /** 版本 */
  version: number;
  /** 创建时间 */
  createdAt: string;
  /** 最后修改时间 */
  updatedAt: string;
  /** 团队信息 */
  teamInfo: {
    name: string;
    mission: string;
    goal: string;
  };
  /** 成员列表 */
  members: SquadMember[];
  /** 标签 */
  tags: string[];
}

// ============================================================
// 专家池索引（目录）
// ============================================================

export interface PoolIndex {
  /** 专家列表摘要 */
  experts: Array<{
    id: string;
    name: string;
    tagline: string;
    domains: string[];
    tags: string[];
  }>;
  /** 专家团列表摘要 */
  squads: Array<{
    id: string;
    name: string;
    mission: string;
    memberCount: number;
    tags: string[];
  }>;
}

// ============================================================
// 协作模式相关类型
// ============================================================

export interface TaskAssignment {
  /** 任务 ID（唯一标识） */
  taskId: string;
  /** 分配给哪个专家 */
  expertId: string;
  /** 任务描述 */
  description: string;
  /** 依赖的前置任务 ID 列表 */
  dependsOn: string[];
  /** 优先级（数字越小越高） */
  priority: number;
}

export interface TaskPlan {
  /** 计划 ID */
  id: string;
  /** 原始用户目标 */
  goal: string;
  /** 团长选择的专家团或临时组建的专家组合 */
  squadId?: string;
  adHocExperts?: string[];
  /** 任务分配列表 */
  assignments: TaskAssignment[];
  /** 执行状态 */
  status: 'planning' | 'running' | 'completed' | 'failed';
}

export interface TaskResult {
  /** 任务分配 ID */
  assignmentId: string;
  /** 执行专家 ID */
  expertId: string;
  /** 执行状态 */
  status: 'success' | 'failed' | 'skipped';
  /** 产出内容 */
  output: string;
  /** Token 消耗 */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  /** 使用的模型 */
  model: string;
  /** 使用的渠道 */
  provider: string;
  /** 执行耗时（毫秒） */
  durationMs: number;
}

// ============================================================
// 监控面板数据
// ============================================================

export interface MonitorSnapshot {
  /** 快照时间 */
  timestamp: string;
  /** 各专家/成员 Token 消耗 */
  members: Array<{
    expertId: string;
    expertName: string;
    model: string;
    provider: string;
    tokenUsage: {
      input: number;
      output: number;
      total: number;
    };
    status: 'idle' | 'running' | 'completed' | 'failed';
  }>;
  /** 汇总 */
  summary: {
    totalInput: number;
    totalOutput: number;
    totalTokens: number;
    activeMembers: number;
  };
}

// ============================================================
// 插件配置
// ============================================================

export interface PluginConfig {
  /** 专家池存储路径（默认 ${DSH_HOME}/expert-studio/pool/） */
  poolPath: string;
  /** 是否启用记忆压缩层 */
  enableMemoryBus: boolean;
  /** 默认路由策略 */
  defaultRoutingStrategy: RoutingStrategy;
}
