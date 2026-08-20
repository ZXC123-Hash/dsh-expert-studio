/**
 * 专家池管理 — 文件型 CRUD
 * 存储格式：每个专家/专家团一个 YAML 文件，pool/index.json 为索引
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ExpertProfile,
  SquadProfile,
  PoolIndex,
} from '../types.js';

export class ExpertPool {
  private poolDir: string;
  private expertsDir: string;
  private squadsDir: string;
  private indexPath: string;

  constructor(basePath: string) {
    this.poolDir = basePath;
    this.expertsDir = path.join(basePath, 'experts');
    this.squadsDir = path.join(basePath, 'squads');
    this.indexPath = path.join(basePath, 'index.json');
    this.ensureDirs();
  }

  // ============================================================
  // 目录初始化
  // ============================================================

  private ensureDirs(): void {
    fs.mkdirSync(this.expertsDir, { recursive: true });
    fs.mkdirSync(this.squadsDir, { recursive: true });

    if (!fs.existsSync(this.indexPath)) {
      const empty: PoolIndex = { experts: [], squads: [] };
      fs.writeFileSync(this.indexPath, JSON.stringify(empty, null, 2), 'utf-8');
    }
  }

  // ============================================================
  // 索引读写
  // ============================================================

  private readIndex(): PoolIndex {
    const raw = fs.readFileSync(this.indexPath, 'utf-8');
    return JSON.parse(raw) as PoolIndex;
  }

  private writeIndex(index: PoolIndex): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  // ============================================================
  // 专家 CRUD
  // ============================================================

  /** 创建专家 */
  createExpert(profile: ExpertProfile): ExpertProfile {
    const filePath = path.join(this.expertsDir, `${profile.id}.yaml`);

    if (fs.existsSync(filePath)) {
      throw new Error(`Expert already exists: ${profile.id}`);
    }

    const yamlContent = this.profileToYaml(profile);
    fs.writeFileSync(filePath, yamlContent, 'utf-8');

    // 更新索引
    const index = this.readIndex();
    index.experts.push({
      id: profile.id,
      name: profile.identity.name,
      tagline: profile.identity.tagline,
      domains: profile.persona.domains,
      tags: profile.tags,
    });
    this.writeIndex(index);

    return profile;
  }

  /** 读取专家完整档案 */
  getExpert(id: string): ExpertProfile | null {
    const filePath = path.join(this.expertsDir, `${id}.yaml`);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf-8');
    return this.yamlToProfile(raw);
  }

  /** 更新专家档案 */
  updateExpert(id: string, updates: Partial<ExpertProfile>): ExpertProfile {
    const existing = this.getExpert(id);
    if (!existing) {
      throw new Error(`Expert not found: ${id}`);
    }

    const updated: ExpertProfile = {
      ...existing,
      ...updates,
      id: existing.id, // id 不可改
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    const filePath = path.join(this.expertsDir, `${id}.yaml`);
    fs.writeFileSync(filePath, this.profileToYaml(updated), 'utf-8');

    // 更新索引
    const index = this.readIndex();
    const idxEntry = index.experts.findIndex((e) => e.id === id);
    if (idxEntry >= 0) {
      index.experts[idxEntry] = {
        id: updated.id,
        name: updated.identity.name,
        tagline: updated.identity.tagline,
        domains: updated.persona.domains,
        tags: updated.tags,
      };
    }
    this.writeIndex(index);

    return updated;
  }

  /** 删除专家 */
  deleteExpert(id: string): boolean {
    const filePath = path.join(this.expertsDir, `${id}.yaml`);
    if (!fs.existsSync(filePath)) return false;

    fs.unlinkSync(filePath);

    const index = this.readIndex();
    index.experts = index.experts.filter((e) => e.id !== id);
    this.writeIndex(index);

    return true;
  }

  /** 列出所有专家（摘要） */
  listExperts(): PoolIndex['experts'] {
    return this.readIndex().experts;
  }

  /** 按标签/领域搜索专家 */
  searchExperts(query: string): PoolIndex['experts'] {
    const q = query.toLowerCase();
    const index = this.readIndex();
    return index.experts.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.tagline.toLowerCase().includes(q) ||
        e.domains.some((d) => d.toLowerCase().includes(q)) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // ============================================================
  // 专家团 CRUD
  // ============================================================

  /** 创建专家团 */
  createSquad(profile: SquadProfile): SquadProfile {
    const filePath = path.join(this.squadsDir, `${profile.id}.yaml`);

    if (fs.existsSync(filePath)) {
      throw new Error(`Squad already exists: ${profile.id}`);
    }

    const yamlContent = this.squadToYaml(profile);
    fs.writeFileSync(filePath, yamlContent, 'utf-8');

    const index = this.readIndex();
    index.squads.push({
      id: profile.id,
      name: profile.teamInfo.name,
      mission: profile.teamInfo.mission,
      memberCount: profile.members.length,
      tags: profile.tags,
    });
    this.writeIndex(index);

    return profile;
  }

  /** 读取专家团 */
  getSquad(id: string): SquadProfile | null {
    const filePath = path.join(this.squadsDir, `${id}.yaml`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return this.yamlToSquad(raw);
  }

  /** 更新专家团 */
  updateSquad(id: string, updates: Partial<SquadProfile>): SquadProfile {
    const existing = this.getSquad(id);
    if (!existing) {
      throw new Error(`Squad not found: ${id}`);
    }

    const updated: SquadProfile = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    const filePath = path.join(this.squadsDir, `${id}.yaml`);
    fs.writeFileSync(filePath, this.squadToYaml(updated), 'utf-8');

    const index = this.readIndex();
    const idxEntry = index.squads.findIndex((s) => s.id === id);
    if (idxEntry >= 0) {
      index.squads[idxEntry] = {
        id: updated.id,
        name: updated.teamInfo.name,
        mission: updated.teamInfo.mission,
        memberCount: updated.members.length,
        tags: updated.tags,
      };
    }
    this.writeIndex(index);

    return updated;
  }

  /** 删除专家团 */
  deleteSquad(id: string): boolean {
    const filePath = path.join(this.squadsDir, `${id}.yaml`);
    if (!fs.existsSync(filePath)) return false;

    fs.unlinkSync(filePath);

    const index = this.readIndex();
    index.squads = index.squads.filter((s) => s.id !== id);
    this.writeIndex(index);

    return true;
  }

  /** 列出所有专家团 */
  listSquads(): PoolIndex['squads'] {
    return this.readIndex().squads;
  }

  // ============================================================
  // YAML 序列化（轻量实现，避免外部依赖）
  // ============================================================

  /**
   * 将专家档案序列化为 YAML 格式字符串
   * 轻量实现：不引入 js-yaml 依赖，手动拼接
   */
  private profileToYaml(profile: ExpertProfile): string {
    const lines: string[] = [];
    lines.push(`# Expert Profile: ${profile.identity.name}`);
    lines.push(`# Generated by dsh-expert-studio`);
    lines.push('');
    lines.push(`id: "${profile.id}"`);
    lines.push(`version: ${profile.version}`);
    lines.push(`createdAt: "${profile.createdAt}"`);
    lines.push(`updatedAt: "${profile.updatedAt}"`);
    lines.push('');
    lines.push('identity:');
    lines.push(`  name: "${this.escapeYaml(profile.identity.name)}"`);
    lines.push(`  tagline: "${this.escapeYaml(profile.identity.tagline)}"`);
    if (profile.identity.avatar) {
      lines.push(`  avatar: "${profile.identity.avatar}"`);
    }
    lines.push('');
    lines.push('persona:');
    lines.push(`  personality: "${this.escapeYaml(profile.persona.personality)}"`);
    lines.push(`  stance: "${this.escapeYaml(profile.persona.stance)}"`);
    lines.push('  domains:');
    profile.persona.domains.forEach((d) => lines.push(`    - "${this.escapeYaml(d)}"`));
    lines.push('');
    lines.push('methodology:');
    lines.push('  workflow:');
    profile.methodology.workflow.forEach((w) => lines.push(`    - "${this.escapeYaml(w)}"`));
    lines.push(`  deliveryStandard: "${this.escapeYaml(profile.methodology.deliveryStandard)}"`);
    lines.push('');
    lines.push('skills:');
    profile.skills.forEach((s) => lines.push(`  - "${this.escapeYaml(s)}"`));
    lines.push('');
    lines.push('tags:');
    profile.tags.forEach((t) => lines.push(`  - "${this.escapeYaml(t)}"`));

    // 模型配置（可选）
    if (profile.modelConfig) {
      lines.push('');
      lines.push('modelConfig:');
      lines.push(`  defaultModel: "${profile.modelConfig.defaultModel}"`);
      lines.push(`  routingStrategy: "${profile.modelConfig.routingStrategy}"`);
      lines.push('  providers:');
      profile.modelConfig.providers.forEach((p) => {
        lines.push(`    - api: "${p.api}"`);
        lines.push(`      baseUrl: "${p.baseUrl}"`);
        if (p.apiKeyEnv) lines.push(`      apiKeyEnv: "${p.apiKeyEnv}"`);
      });
      lines.push('  tiers:');
      profile.modelConfig.tiers.forEach((t) => {
        lines.push(`    - tier: "${t.tier}"`);
        lines.push(`      model: "${t.model}"`);
        lines.push(`      applicable: "${this.escapeYaml(t.applicable)}"`);
      });
    }

    // 道具（可选）
    if (profile.tools.length > 0) {
      lines.push('');
      lines.push('tools:');
      profile.tools.forEach((tool) => {
        lines.push(`  - type: "${tool.type}"`);
        if ('config' in tool && tool.config) {
          lines.push('    config:');
          Object.entries(tool.config).forEach(([k, v]) => {
            lines.push(`      ${k}: "${v}"`);
          });
        }
      });
    }

    return lines.join('\n') + '\n';
  }

  private squadToYaml(squad: SquadProfile): string {
    const lines: string[] = [];
    lines.push(`# Squad Profile: ${squad.teamInfo.name}`);
    lines.push(`# Generated by dsh-expert-studio`);
    lines.push('');
    lines.push(`id: "${squad.id}"`);
    lines.push(`version: ${squad.version}`);
    lines.push(`createdAt: "${squad.createdAt}"`);
    lines.push(`updatedAt: "${squad.updatedAt}"`);
    lines.push('');
    lines.push('teamInfo:');
    lines.push(`  name: "${this.escapeYaml(squad.teamInfo.name)}"`);
    lines.push(`  mission: "${this.escapeYaml(squad.teamInfo.mission)}"`);
    lines.push(`  goal: "${this.escapeYaml(squad.teamInfo.goal)}"`);
    lines.push('');
    lines.push('members:');
    squad.members.forEach((m) => {
      lines.push(`  - expertId: "${m.expertId}"`);
      lines.push(`    role: "${this.escapeYaml(m.role)}"`);
      lines.push(`    parallel: ${m.parallel}`);
    });
    lines.push('');
    lines.push('tags:');
    squad.tags.forEach((t) => lines.push(`  - "${this.escapeYaml(t)}"`));

    return lines.join('\n') + '\n';
  }

  /**
   * 从 YAML 字符串解析专家档案
   * 轻量实现：基于正则逐行解析
   */
  private yamlToProfile(yaml: string): ExpertProfile {
    // 简化解析：使用行级正则匹配关键字段
    const get = (key: string): string => {
      const match = yaml.match(new RegExp(`^${key}:\\s*"?([^"]*)"?\\s*$`, 'm'));
      return match?.[1]?.trim() ?? '';
    };

    const getList = (key: string): string[] => {
      const items: string[] = [];
      // 找到 key 后的缩进列表
      const keyPattern = new RegExp(`^${key}:\\s*$`, 'm');
      const keyMatch = keyPattern.exec(yaml);
      if (!keyMatch) return items;

      const afterKey = yaml.slice(keyMatch.index + keyMatch[0].length);
      const lines = afterKey.split('\n');
      for (const line of lines) {
        const itemMatch = line.match(/^\s+-\s+"?([^"]*)"?\s*$/);
        if (itemMatch) {
          items.push(itemMatch[1].trim());
        } else if (line.match(/^\S/) && line.trim() !== '') {
          break; // 遇到非缩进行则停止
        }
      }
      return items;
    };

    const id = get('id');
    const version = parseInt(get('version') || '1', 10);

    return {
      id,
      version,
      createdAt: get('createdAt'),
      updatedAt: get('updatedAt'),
      identity: {
        name: this.getFieldInBlock(yaml, 'identity', 'name'),
        tagline: this.getFieldInBlock(yaml, 'identity', 'tagline'),
        avatar: this.getFieldInBlock(yaml, 'identity', 'avatar') || undefined,
      },
      persona: {
        personality: this.getFieldInBlock(yaml, 'persona', 'personality'),
        stance: this.getFieldInBlock(yaml, 'persona', 'stance'),
        domains: this.getNestedList(yaml, 'persona', 'domains'),
      },
      methodology: {
        workflow: this.getNestedList(yaml, 'methodology', 'workflow'),
        deliveryStandard: this.getFieldInBlock(yaml, 'methodology', 'deliveryStandard'),
      },
      skills: getList('skills'),
      tools: this.parseToolsBlock(yaml),
      tags: getList('tags'),
    };
  }

  private yamlToSquad(yaml: string): SquadProfile {
    const get = (key: string): string => {
      const match = yaml.match(new RegExp(`^${key}:\\s*"?([^"]*)"?\\s*$`, 'm'));
      return match?.[1]?.trim() ?? '';
    };

    const id = get('id');
    const version = parseInt(get('version') || '1', 10);

    // 解析成员列表
    const members: SquadProfile['members'] = [];
    const memberPattern = /-\s+expertId:\s*"([^"]+)"/g;
    let memberMatch;
    while ((memberMatch = memberPattern.exec(yaml)) !== null) {
      const block = yaml.slice(memberMatch.index, memberMatch.index + 200);
      const roleMatch = block.match(/role:\s*"([^"]+)"/);
      const parallelMatch = block.match(/parallel:\s*(true|false)/);
      members.push({
        expertId: memberMatch[1],
        role: roleMatch?.[1] ?? '',
        parallel: parallelMatch?.[1] === 'true',
      });
    }

    return {
      id,
      version,
      createdAt: get('createdAt'),
      updatedAt: get('updatedAt'),
      teamInfo: {
        name: this.getFieldInBlock(yaml, 'teamInfo', 'name'),
        mission: this.getFieldInBlock(yaml, 'teamInfo', 'mission'),
        goal: this.getFieldInBlock(yaml, 'teamInfo', 'goal'),
      },
      members,
      tags: this.getTopLevelList(yaml, 'tags'),
    };
  }

  // ============================================================
  // YAML 辅助解析
  // ============================================================

  private getFieldInBlock(yaml: string, blockName: string, fieldName: string): string {
    // 找到 blockName: 块内的 fieldName
    const blockPattern = new RegExp(`^${blockName}:\\s*$`, 'm');
    const blockMatch = blockPattern.exec(yaml);
    if (!blockMatch) return '';

    const afterBlock = yaml.slice(blockMatch.index + blockMatch[0].length);
    const lines = afterBlock.split('\n');

    for (const line of lines) {
      // 遇到顶层字段则停止
      if (line.match(/^\S/) && line.trim() !== '') break;
      // 匹配缩进字段
      const fieldMatch = line.match(new RegExp(`^\\s+${fieldName}:\\s*"?([^"]*)"?\\s*$`));
      if (fieldMatch) return fieldMatch[1].trim();
    }
    return '';
  }

  private getNestedList(yaml: string, blockName: string, fieldName: string): string[] {
    const blockPattern = new RegExp(`^${blockName}:\\s*$`, 'm');
    const blockMatch = blockPattern.exec(yaml);
    if (!blockMatch) return [];

    const afterBlock = yaml.slice(blockMatch.index + blockMatch[0].length);

    // 找到 fieldName: 的位置
    const fieldPattern = new RegExp(`^\\s+${fieldName}:\\s*$`, 'm');
    const fieldMatch = fieldPattern.exec(afterBlock);
    if (!fieldMatch) return [];

    const afterField = afterBlock.slice(fieldMatch.index + fieldMatch[0].length);
    const items: string[] = [];

    for (const line of afterField.split('\n')) {
      const itemMatch = line.match(/^\s+-\s+"?([^"]*)"?\s*$/);
      if (itemMatch) {
        items.push(itemMatch[1].trim());
      } else if (line.match(/^\S/) || (line.match(/^\s{2}\S/) && !line.match(/^\s+-/))) {
        break;
      }
    }

    return items;
  }

  private getTopLevelList(yaml: string, listName: string): string[] {
    const items: string[] = [];
    const pattern = new RegExp(`^${listName}:\\s*$`, 'm');
    const match = pattern.exec(yaml);
    if (!match) return items;

    const after = yaml.slice(match.index + match[0].length);
    for (const line of after.split('\n')) {
      const itemMatch = line.match(/^\s+-\s+"?([^"]*)"?\s*$/);
      if (itemMatch) {
        items.push(itemMatch[1].trim());
      } else if (line.match(/^\S/) && line.trim() !== '') {
        break;
      }
    }
    return items;
  }

  private parseToolsBlock(yaml: string): ExpertProfile['tools'] {
    const tools: ExpertProfile['tools'] = [];
    const toolsPattern = /^tools:\s*$/m;
    const toolsMatch = toolsPattern.exec(yaml);
    if (!toolsMatch) return tools;

    const afterTools = yaml.slice(toolsMatch.index + toolsMatch[0].length);
    const blocks = afterTools.split(/(?=\s+- type:)/);

    for (const block of blocks) {
      const typeMatch = block.match(/type:\s*"([^"]+)"/);
      if (!typeMatch) continue;

      const type = typeMatch[1];
      const configStr = block.match(/config:\s*\n([\s\S]*?)(?=\n\s+- type:|\n\S|$)/);

      if (type === 'ob_memory') {
        const vaultMatch = configStr?.[1]?.match(/vaultPath:\s*"([^"]+)"/);
        const modeMatch = configStr?.[1]?.match(/apiMode:\s*"([^"]+)"/);
        tools.push({
          type: 'ob_memory',
          config: {
            vaultPath: vaultMatch?.[1] ?? '',
            apiMode: (modeMatch?.[1] as 'file' | 'rest') ?? 'file',
          },
        });
      } else if (type === 'vision') {
        tools.push({ type: 'vision' });
      } else if (type === 'longterm_memory') {
        tools.push({ type: 'longterm_memory' });
      } else if (type === 'memory_bus') {
        tools.push({ type: 'memory_bus' });
      }
    }

    return tools;
  }

  private escapeYaml(str: string): string {
    return str.replace(/"/g, '\\"');
  }
}
