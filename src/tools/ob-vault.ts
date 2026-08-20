/**
 * OB 记忆库道具 — Obsidian 知识库文件直读工具组
 * 
 * 功能：搜索笔记 / 读笔记 / 写笔记 / 解析双向链接
 * 访问方式：文件直读（不走 Local REST API），适配云服务器部署
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================
// 类型定义
// ============================================================

export interface ObsidianNote {
  /** 文件路径（相对于 vault） */
  filePath: string;
  /** 笔记标题（从 H1 或文件名提取） */
  title: string;
  /** 正文内容（去掉 frontmatter） */
  content: string;
  /** YAML frontmatter（如有） */
  frontmatter: Record<string, unknown>;
  /** 出链（[[链接]]） */
  outboundLinks: string[];
  /** 文件大小（字节） */
  sizeBytes: number;
  /** 最后修改时间 */
  modifiedAt: string;
}

export interface SearchResult {
  filePath: string;
  title: string;
  /** 匹配的片段（含上下文） */
  snippets: string[];
  /** 相关度评分（0-1） */
  score: number;
}

// ============================================================
// OB 记忆库引擎
// ============================================================

export class ObsidianVault {
  private vaultPath: string;
  private noteCache: Map<string, ObsidianNote> = new Map();
  private cacheInvalidated: boolean = true;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.validateVault();
  }

  // ============================================================
  // 基础操作
  // ============================================================

  /** 验证知识库路径 */
  private validateVault(): void {
    if (!fs.existsSync(this.vaultPath)) {
      throw new Error(`Obsidian vault not found: ${this.vaultPath}`);
    }
    const stat = fs.statSync(this.vaultPath);
    if (!stat.isDirectory()) {
      throw new Error(`Vault path is not a directory: ${this.vaultPath}`);
    }
  }

  /** 列出所有 .md 文件 */
  listNotes(subfolder?: string): string[] {
    const searchDir = subfolder
      ? path.join(this.vaultPath, subfolder)
      : this.vaultPath;

    if (!fs.existsSync(searchDir)) return [];

    const results: string[] = [];
    this.walkDir(searchDir, (filePath) => {
      if (filePath.endsWith('.md')) {
        results.push(path.relative(this.vaultPath, filePath));
      }
    });
    return results;
  }

  /** 读取单个笔记 */
  readNote(relativePath: string): ObsidianNote | null {
    const fullPath = path.join(this.vaultPath, relativePath);
    if (!fs.existsSync(fullPath)) return null;

    // 检查缓存
    const cached = this.noteCache.get(relativePath);
    if (cached && !this.cacheInvalidated) {
      const stat = fs.statSync(fullPath);
      if (stat.mtime.toISOString() === cached.modifiedAt) {
        return cached;
      }
    }

    const raw = fs.readFileSync(fullPath, 'utf-8');
    const parsed = this.parseMarkdown(raw);
    const stat = fs.statSync(fullPath);

    const note: ObsidianNote = {
      filePath: relativePath,
      title: parsed.title || path.basename(relativePath, '.md'),
      content: parsed.content,
      frontmatter: parsed.frontmatter,
      outboundLinks: this.extractLinks(parsed.content),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };

    this.noteCache.set(relativePath, note);
    return note;
  }

  /** 写入/更新笔记 */
  writeNote(relativePath: string, content: string, frontmatter?: Record<string, unknown>): ObsidianNote {
    const fullPath = path.join(this.vaultPath, relativePath);

    // 确保父目录存在
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // 组装完整内容（frontmatter + body）
    let fullContent = '';
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      fullContent += '---\n';
      for (const [key, value] of Object.entries(frontmatter)) {
        fullContent += `${key}: ${JSON.stringify(value)}\n`;
      }
      fullContent += '---\n\n';
    }
    fullContent += content;

    fs.writeFileSync(fullPath, fullContent, 'utf-8');
    this.cacheInvalidated = true;

    return this.readNote(relativePath)!;
  }

  /** 删除笔记 */
  deleteNote(relativePath: string): boolean {
    const fullPath = path.join(this.vaultPath, relativePath);
    if (!fs.existsSync(fullPath)) return false;

    fs.unlinkSync(fullPath);
    this.noteCache.delete(relativePath);
    return true;
  }

  // ============================================================
  // 搜索
  // ============================================================

  /** 全文搜索（关键词匹配） */
  searchNotes(query: string, options?: {
    maxResults?: number;
    subfolder?: string;
    caseSensitive?: boolean;
  }): SearchResult[] {
    const maxResults = options?.maxResults ?? 20;
    const caseSensitive = options?.caseSensitive ?? false;
    const notes = this.listNotes(options?.subfolder);
    const results: SearchResult[] = [];

    const queryLower = caseSensitive ? query : query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    for (const notePath of notes) {
      const note = this.readNote(notePath);
      if (!note) continue;

      const searchText = caseSensitive
        ? `${note.title} ${note.content}`
        : `${note.title} ${note.content}`.toLowerCase();

      // 计算匹配度
      let score = 0;
      const snippets: string[] = [];

      for (const word of queryWords) {
        const count = this.countOccurrences(searchText, word);
        if (count > 0) {
          score += count;
          // 提取包含关键词的片段
          const snippet = this.extractSnippet(note.content, word, caseSensitive);
          if (snippet && snippets.length < 3) {
            snippets.push(snippet);
          }
        }
      }

      // 标题匹配加分
      const titleLower = caseSensitive ? note.title : note.title.toLowerCase();
      if (queryWords.some((w) => titleLower.includes(w))) {
        score *= 2;
      }

      // 标签匹配加分
      const tags = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags : [];
      if (tags.some((t: any) => String(t).toLowerCase().includes(queryLower))) {
        score *= 1.5;
      }

      if (score > 0) {
        results.push({
          filePath: notePath,
          title: note.title,
          snippets,
          score: Math.min(score / (queryWords.length * 5), 1), // 归一化到 0-1
        });
      }
    }

    // 按分数降序
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  // ============================================================
  // 双向链接解析
  // ============================================================

  /** 提取笔记中的所有 [[链接]] */
  extractLinks(content: string): string[] {
    const linkPattern = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g;
    const links: string[] = [];
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      links.push(match[1].trim());
    }
    return [...new Set(links)];
  }

  /** 获取某笔记的反向链接（哪些笔记链接到了它） */
  getBacklinks(notePath: string): string[] {
    const noteName = path.basename(notePath, '.md');
    const allNotes = this.listNotes();
    const backlinks: string[] = [];

    for (const otherPath of allNotes) {
      if (otherPath === notePath) continue;
      const other = this.readNote(otherPath);
      if (!other) continue;

      if (other.outboundLinks.some((link) => {
        // 精确匹配或模糊匹配（不含扩展名）
        return link === noteName ||
          link === notePath ||
          link === otherPath.replace(/\.md$/, '');
      })) {
        backlinks.push(otherPath);
      }
    }

    return backlinks;
  }

  /** 构建链接图谱（指定深度） */
  buildLinkGraph(startNote: string, depth: number = 2): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();
    const queue: Array<{ path: string; currentDepth: number }> = [
      { path: startNote, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const { path: currentPath, currentDepth } = queue.shift()!;
      if (visited.has(currentPath) || currentDepth > depth) continue;
      visited.add(currentPath);

      const note = this.readNote(currentPath);
      if (!note) continue;

      const outbound = note.outboundLinks;
      graph.set(currentPath, outbound);

      // 解析链接目标并加入队列
      for (const link of outbound) {
        const resolved = this.resolveLink(link, currentPath);
        if (resolved && !visited.has(resolved)) {
          queue.push({ path: resolved, currentDepth: currentDepth + 1 });
        }
      }
    }

    return graph;
  }

  // ============================================================
  // 知识库统计
  // ============================================================

  /** 获取知识库概览统计 */
  getStats(): {
    totalNotes: number;
    totalSize: number;
    totalLinks: number;
    tags: Record<string, number>;
    recentNotes: Array<{ path: string; title: string; modifiedAt: string }>;
  } {
    const notes = this.listNotes();
    let totalSize = 0;
    let totalLinks = 0;
    const tagCount: Record<string, number> = {};
    const recent: Array<{ path: string; title: string; modifiedAt: string }> = [];

    for (const notePath of notes) {
      const note = this.readNote(notePath);
      if (!note) continue;

      totalSize += note.sizeBytes;
      totalLinks += note.outboundLinks.length;

      // 统计标签
      const tags = Array.isArray(note.frontmatter.tags) ? note.frontmatter.tags : [];
      for (const tag of tags) {
        const t = String(tag);
        tagCount[t] = (tagCount[t] || 0) + 1;
      }

      recent.push({ path: notePath, title: note.title, modifiedAt: note.modifiedAt });
    }

    // 按修改时间降序
    recent.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    return {
      totalNotes: notes.length,
      totalSize,
      totalLinks,
      tags: tagCount,
      recentNotes: recent.slice(0, 10),
    };
  }

  // ============================================================
  // 内部辅助
  // ============================================================

  /** 递归遍历目录 */
  private walkDir(dir: string, callback: (filePath: string) => void): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // 跳过隐藏目录和 .obsidian
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      if (entry.isDirectory()) {
        this.walkDir(fullPath, callback);
      } else {
        callback(fullPath);
      }
    }
  }

  /** 解析 Markdown（frontmatter + 正文） */
  private parseMarkdown(raw: string): {
    title: string;
    content: string;
    frontmatter: Record<string, unknown>;
  } {
    let frontmatter: Record<string, unknown> = {};
    let content = raw;
    let title = '';

    // 解析 YAML frontmatter
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (fmMatch) {
      const fmStr = fmMatch[1];
      content = raw.slice(fmMatch[0].length);
      // 简单 YAML 解析
      for (const line of fmStr.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          let value: unknown = line.slice(colonIdx + 1).trim();
          // 尝试解析 JSON 值
          try {
            value = JSON.parse(String(value));
          } catch {
            // 保持字符串
          }
          frontmatter[key] = value;
        }
      }
    }

    // 提取标题（第一个 # 标题）
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    return { title, content: content.trim(), frontmatter };
  }

  /** 统计字符串中子串出现次数 */
  private countOccurrences(text: string, substring: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(substring, pos)) !== -1) {
      count++;
      pos += substring.length;
    }
    return count;
  }

  /** 提取包含关键词的上下文片段 */
  private extractSnippet(content: string, keyword: string, caseSensitive: boolean): string | null {
    const searchContent = caseSensitive ? content : content.toLowerCase();
    const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
    const pos = searchContent.indexOf(searchKeyword);
    if (pos === -1) return null;

    // 取前后各 60 字符
    const start = Math.max(0, pos - 60);
    const end = Math.min(content.length, pos + keyword.length + 60);
    let snippet = content.slice(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  /** 解析 [[链接]] 到实际文件路径 */
  private resolveLink(link: string, fromNotePath: string): string | null {
    // 1. 直接匹配（相对路径）
    const directPath = path.join(path.dirname(fromNotePath), link + '.md');
    if (fs.existsSync(path.join(this.vaultPath, directPath))) {
      return directPath;
    }

    // 2. 全局搜索文件名匹配
    const allNotes = this.listNotes();
    const linkLower = link.toLowerCase();
    for (const notePath of allNotes) {
      const baseName = path.basename(notePath, '.md').toLowerCase();
      if (baseName === linkLower) {
        return notePath;
      }
    }

    return null;
  }
}
