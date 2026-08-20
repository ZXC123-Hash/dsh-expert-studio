/**
 * LLM 适配层 — 封装 dsh ctx.llm 调用
 * 
 * 将插件内所有需要 LLM 的地方统一通过这个适配器调用，
 * 方便：①mock 测试 ②切换模型 ③token 统计 ④路由策略
 */

// ============================================================
// LLM 调用接口
// ============================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

export interface LLMAdapter {
  /** 单次对话（无上下文） */
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;

  /** 流式对话（返回异步迭代器） */
  chatStream?(messages: LLMMessage[], options?: LLMOptions): AsyncIterable<string>;

  /** 获取当前模型信息 */
  getModelInfo(): { model: string; provider: string };
}

export interface LLMOptions {
  /** 指定模型（覆盖默认） */
  model?: string;
  /** 温度 */
  temperature?: number;
  /** 最大输出 token */
  maxTokens?: number;
  /** 停止词 */
  stop?: string[];
}

// ============================================================
// dsh ctx 适配器（运行时注入）
// ============================================================

/**
 * 从 dsh ctx 创建 LLM 适配器
 * 在插件 apply() 中调用：createDshLLMAdapter(ctx)
 */
export function createDshLLMAdapter(ctx: any, defaultModel?: string): LLMAdapter {
  return {
    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
      // 尝试使用 dsh 的 LLM 接口
      // dsh 可能通过 ctx.llm.chat / ctx.ai.chat / ctx.providers 暴露
      const llm = ctx.llm || ctx.ai || ctx.providers?.llm;

      if (llm && typeof llm.chat === 'function') {
        const result = await llm.chat({
          messages,
          model: options?.model || defaultModel,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens,
          stop: options?.stop,
        });

        return {
          content: result.content || result.text || result.message?.content || '',
          usage: {
            inputTokens: result.usage?.input_tokens || result.usage?.prompt_tokens || 0,
            outputTokens: result.usage?.output_tokens || result.usage?.completion_tokens || 0,
            totalTokens: result.usage?.total_tokens || 0,
          },
          model: result.model || options?.model || defaultModel || 'unknown',
          provider: result.provider || 'dsh',
        };
      }

      // 降级：尝试 cordis 风格的工具调用
      if (ctx.call && typeof ctx.call === 'function') {
        const result = await ctx.call('llm:chat', {
          messages,
          model: options?.model || defaultModel,
        });

        return {
          content: result?.content || result?.text || '',
          usage: result?.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          model: result?.model || 'unknown',
          provider: result?.provider || 'dsh',
        };
      }

      // 最终降级
      return {
        content: '[LLM_NOT_AVAILABLE] dsh LLM 接口未检测到。请确保 dsh 运行时正确加载。',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'none',
        provider: 'none',
      };
    },

    getModelInfo() {
      return {
        model: defaultModel || ctx.model || 'unknown',
        provider: ctx.provider || 'dsh',
      };
    },
  };
}

// ============================================================
// Mock 适配器（测试用）
// ============================================================

export function createMockLLMAdapter(responses?: Map<string, string>): LLMAdapter {
  const defaultResponses = new Map<string, string>([
    ['create_expert', '```yaml\nid: "expert_test_001"\nidentity:\n  name: "测试专家"\n  tagline: "用于测试的专家"\npersona:\n  personality: "严谨"\n  stance: "数据驱动"\n  domains:\n    - "测试"\nmethodology:\n  workflow:\n    - "理解需求"\n    - "设计方案"\n    - "执行验证"\n  deliveryStandard: "通过所有测试用例"\nskills:\n  - "测试设计"\n  - "自动化"\ntags:\n  - "test"\n```\n[CONFIRM]'],
    ['default', '这是 Mock 响应。'],
  ]);

  const map = responses || defaultResponses;

  return {
    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
      const lastUserMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';

      // 简单匹配
      let content = map.get('default') || 'Mock response';
      for (const [key, value] of map) {
        if (lastUserMsg.toLowerCase().includes(key)) {
          content = value;
          break;
        }
      }

      return {
        content,
        usage: {
          inputTokens: lastUserMsg.length,
          outputTokens: content.length,
          totalTokens: lastUserMsg.length + content.length,
        },
        model: options?.model || 'mock-model',
        provider: 'mock',
      };
    },

    getModelInfo() {
      return { model: 'mock-model', provider: 'mock' };
    },
  };
}
