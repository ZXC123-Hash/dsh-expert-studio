/**
 * 记忆总线 + OB 知识库 单元测试
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryBus } from '../memory/memory-bus.js';
import { ObsidianVault } from '../tools/ob-vault.js';

describe('MemoryBus', () => {
  let bus: MemoryBus;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-bus-test-'));
    bus = new MemoryBus({ storagePath: testDir, defaultNamespace: 'test' });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should store and recall observations', () => {
    bus.store({
      namespace: 'test',
      sourceExpertId: 'expert_001',
      summary: '用户需要响应式布局方案',
      keyFacts: ['移动端优先', '需要兼容 IE11'],
      tags: ['需求', '前端'],
    });

    const results = bus.recall('test', '响应式');
    assert.strictEqual(results.length, 1);
    assert.ok(results[0].summary.includes('响应式'));
  });

  it('should score by relevance', () => {
    bus.store({
      namespace: 'test',
      sourceExpertId: 'expert_001',
      summary: '产品需要 A/B 测试框架',
      keyFacts: ['分桶策略', '统计显著性'],
      tags: ['数据'],
    });

    bus.store({
      namespace: 'test',
      sourceExpertId: 'expert_002',
      summary: '设计需要配色方案',
      keyFacts: ['品牌色', '对比度'],
      tags: ['设计'],
    });

    const results = bus.recall('test', '测试 数据');
    assert.ok(results.length >= 1);
    // 第一条应该更相关
    assert.ok(results[0].summary.includes('A/B'));
  });

  it('should isolate by namespace', () => {
    bus.store({
      namespace: 'project_a',
      sourceExpertId: 'expert_001',
      summary: '项目 A 的需求',
      keyFacts: [],
      tags: [],
    });

    bus.store({
      namespace: 'project_b',
      sourceExpertId: 'expert_001',
      summary: '项目 B 的需求',
      keyFacts: [],
      tags: [],
    });

    const aResults = bus.recall('project_a', '需求');
    const bResults = bus.recall('project_b', '需求');

    assert.strictEqual(aResults.length, 1);
    assert.ok(aResults[0].summary.includes('项目 A'));
    assert.strictEqual(bResults.length, 1);
    assert.ok(bResults[0].summary.includes('项目 B'));
  });

  it('should track stats', () => {
    bus.store({
      namespace: 'stats_test',
      sourceExpertId: 'expert_001',
      summary: '测试数据',
      keyFacts: ['fact1'],
      tags: ['tag1', 'tag2'],
    });

    const stats = bus.getStats('stats_test');
    assert.strictEqual(stats.totalObservations, 1);
    assert.deepStrictEqual(stats.experts, ['expert_001']);
    assert.ok(stats.topTags.length > 0);
  });

  it('should clear namespace', () => {
    bus.store({
      namespace: 'clear_test',
      sourceExpertId: 'expert_001',
      summary: '临时数据',
      keyFacts: [],
      tags: [],
    });

    const count = bus.clear('clear_test');
    assert.strictEqual(count, 1);
    assert.strictEqual(bus.getAll('clear_test').length, 0);
  });
});

describe('ObsidianVault', () => {
  let vault: ObsidianVault;
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-vault-test-'));
    // 创建测试笔记
    fs.mkdirSync(path.join(testDir, 'daily'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'welcome.md'), [
      '---',
      'title: Welcome',
      'tags: ["intro", "start"]',
      '---',
      '',
      '# Welcome to the Vault',
      '',
      'This is a test note with [[daily/2026-08-20]] link.',
      'And another [[projects/test]] link.',
    ].join('\n'));
    
    fs.writeFileSync(path.join(testDir, 'daily', '2026-08-20.md'), [
      '---',
      'tags: ["daily"]',
      '---',
      '',
      '# Daily Note',
      '',
      'Today we started the [[welcome]] project.',
    ].join('\n'));

    vault = new ObsidianVault(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should list notes', () => {
    const notes = vault.listNotes();
    assert.strictEqual(notes.length, 2);
    assert.ok(notes.includes('welcome.md'));
    assert.ok(notes.includes(path.join('daily', '2026-08-20.md')));
  });

  it('should read a note with frontmatter', () => {
    const note = vault.readNote('welcome.md');
    assert.ok(note);
    assert.strictEqual(note.title, 'Welcome to the Vault');
    assert.ok(note.content.includes('test note'));
    assert.deepStrictEqual(note.outboundLinks.sort(), ['daily/2026-08-20', 'projects/test']);
  });

  it('should write a new note', () => {
    vault.writeNote('new-note.md', '# New Note\n\nContent here.', { tags: ['new'] });
    
    const note = vault.readNote('new-note.md');
    assert.ok(note);
    assert.strictEqual(note.title, 'New Note');
    assert.ok(note.content.includes('Content here'));
  });

  it('should search notes', () => {
    const results = vault.searchNotes('Welcome');
    assert.ok(results.length >= 1);
    assert.ok(results[0].filePath.includes('welcome'));
  });

  it('should extract links', () => {
    const links = vault.extractLinks('Check [[note1]] and [[note2|display text]]');
    assert.deepStrictEqual(links.sort(), ['note1', 'note2']);
  });

  it('should find backlinks', () => {
    const backlinks = vault.getBacklinks('welcome.md');
    assert.ok(backlinks.length >= 1);
    assert.ok(backlinks.some(b => b.includes('2026-08-20')));
  });

  it('should get vault stats', () => {
    const stats = vault.getStats();
    assert.strictEqual(stats.totalNotes, 2);
    assert.ok(stats.totalSize > 0);
    assert.ok(stats.totalLinks > 0);
  });

  it('should delete a note', () => {
    assert.ok(vault.deleteNote('welcome.md'));
    assert.strictEqual(vault.readNote('welcome.md'), null);
    assert.strictEqual(vault.listNotes().length, 1);
  });
});
