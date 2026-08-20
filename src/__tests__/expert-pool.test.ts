/**
 * 专家池 CRUD 单元测试
 * 使用 Node.js 内置 test runner（无需额外依赖）
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExpertPool } from '../pool/expert-pool.js';
import type { ExpertProfile, SquadProfile } from '../types.js';

describe('ExpertPool', () => {
  let pool: ExpertPool;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expert-pool-test-'));
    pool = new ExpertPool(testDir);
  });

  afterEach(() => {
    // 清理测试目录
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ── 辅助函数 ──

  function makeExpert(overrides?: Partial<ExpertProfile>): ExpertProfile {
    const now = new Date().toISOString();
    return {
      id: 'expert_test_001',
      version: 1,
      createdAt: now,
      updatedAt: now,
      identity: { name: '测试专家', tagline: '用于测试' },
      persona: { personality: '严谨', stance: '数据驱动', domains: ['测试', 'QA'] },
      methodology: { workflow: ['理解需求', '编写用例'], deliveryStandard: '全覆盖' },
      skills: ['自动化测试', '性能测试'],
      tools: [],
      tags: ['test', 'qa'],
      ...overrides,
    };
  }

  function makeSquad(overrides?: Partial<SquadProfile>): SquadProfile {
    const now = new Date().toISOString();
    return {
      id: 'squad_test_001',
      version: 1,
      createdAt: now,
      updatedAt: now,
      teamInfo: { name: '测试团队', mission: '保证质量', goal: '零缺陷' },
      members: [{ expertId: 'expert_test_001', role: '主测试', parallel: true }],
      tags: ['test'],
      ...overrides,
    };
  }

  // ── 专家 CRUD ──

  it('should create an expert', () => {
    const expert = makeExpert();
    pool.createExpert(expert);
    
    const retrieved = pool.getExpert('expert_test_001');
    assert.ok(retrieved);
    assert.strictEqual(retrieved.identity.name, '测试专家');
    assert.deepStrictEqual(retrieved.persona.domains, ['测试', 'QA']);
  });

  it('should list experts', () => {
    pool.createExpert(makeExpert());
    pool.createExpert(makeExpert({ id: 'expert_test_002', identity: { name: '专家二号', tagline: '二号' } }));
    
    const list = pool.listExperts();
    assert.strictEqual(list.length, 2);
  });

  it('should update an expert', () => {
    pool.createExpert(makeExpert());
    
    const updated = pool.updateExpert('expert_test_001', {
      identity: { name: '升级版专家', tagline: '更强了' },
      skills: ['自动化', '性能', '安全'],
    });
    
    assert.strictEqual(updated.identity.name, '升级版专家');
    assert.strictEqual(updated.version, 2);
    assert.strictEqual(updated.skills.length, 3);
  });

  it('should delete an expert', () => {
    pool.createExpert(makeExpert());
    assert.ok(pool.deleteExpert('expert_test_001'));
    assert.strictEqual(pool.getExpert('expert_test_001'), null);
    assert.strictEqual(pool.listExperts().length, 0);
  });

  it('should search experts by domain', () => {
    pool.createExpert(makeExpert());
    pool.createExpert(makeExpert({
      id: 'expert_dev_001',
      identity: { name: '开发者', tagline: '写代码' },
      persona: { personality: '创造', stance: '简洁', domains: ['开发', 'TypeScript'] },
      tags: ['dev'],
    }));
    
    const results = pool.searchExperts('测试');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'expert_test_001');
    
    const devResults = pool.searchExperts('开发');
    assert.strictEqual(devResults.length, 1);
    assert.strictEqual(devResults[0].id, 'expert_dev_001');
  });

  it('should prevent duplicate expert IDs', () => {
    pool.createExpert(makeExpert());
    assert.throws(() => pool.createExpert(makeExpert()), /already exists/);
  });

  // ── 专家团 CRUD ──

  it('should create and get a squad', () => {
    pool.createSquad(makeSquad());
    
    const squad = pool.getSquad('squad_test_001');
    assert.ok(squad);
    assert.strictEqual(squad.teamInfo.name, '测试团队');
    assert.strictEqual(squad.members.length, 1);
  });

  it('should list squads', () => {
    pool.createSquad(makeSquad());
    pool.createSquad(makeSquad({
      id: 'squad_test_002',
      teamInfo: { name: '二号团队', mission: '创新', goal: '突破' },
    }));
    
    assert.strictEqual(pool.listSquads().length, 2);
  });

  it('should update a squad', () => {
    pool.createSquad(makeSquad());
    
    const updated = pool.updateSquad('squad_test_001', {
      teamInfo: { name: '精英团队', mission: '极致质量', goal: '零缺陷' },
    });
    
    assert.strictEqual(updated.teamInfo.name, '精英团队');
    assert.strictEqual(updated.version, 2);
  });

  it('should delete a squad', () => {
    pool.createSquad(makeSquad());
    assert.ok(pool.deleteSquad('squad_test_001'));
    assert.strictEqual(pool.getSquad('squad_test_001'), null);
  });

  // ── YAML 序列化/反序列化 ──

  it('should round-trip expert through YAML', () => {
    const original = makeExpert({
      tools: [{ type: 'ob_memory', config: { vaultPath: '/vault', apiMode: 'file' } }],
    });
    
    pool.createExpert(original);
    const retrieved = pool.getExpert('expert_test_001');
    
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, original.id);
    assert.strictEqual(retrieved.identity.name, original.identity.name);
    assert.deepStrictEqual(retrieved.persona.domains, original.persona.domains);
    assert.deepStrictEqual(retrieved.skills, original.skills);
  });
});
