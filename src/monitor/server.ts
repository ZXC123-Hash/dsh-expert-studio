/**
 * Web 监控服务器 - 提供 Dashboard API 和静态文件服务
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { MonitorStore } from './monitor-store.js';
import type { ExpertPool } from '../pool/expert-pool.js';

const __dirname = path.resolve('web', 'public');

export class MonitorServer {
  private server: http.Server | null = null;
  private monitorStore: MonitorStore;
  private expertPool: ExpertPool;
  private port: number;

  constructor(monitorStore: MonitorStore, expertPool: ExpertPool, port = 7890) {
    this.monitorStore = monitorStore;
    this.expertPool = expertPool;
    this.port = port;
  }

  /** 启动服务器 */
  start(): void {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(this.port, () => {
      console.log(`[MonitorServer] 🖥️  监控面板已启动: http://localhost:${this.port}`);
    });
  }

  /** 停止服务器 */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[MonitorServer] 监控服务器已停止');
    }
  }

  /** 处理 HTTP 请求 */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API 路由
    if (pathname.startsWith('/api/')) {
      this.handleAPI(pathname, res);
      return;
    }

    // 静态文件服务
    this.serveStatic(pathname, res);
  }

  /** 处理 API 请求 */
  private handleAPI(pathname: string, res: http.ServerResponse): void {
    try {
      switch (pathname) {
        case '/api/summary':
          this.sendJSON(res, this.monitorStore.getSummary());
          break;

        case '/api/today':
          this.sendJSON(res, this.monitorStore.getTodayStats());
          break;

        case '/api/recent':
          this.sendJSON(res, this.monitorStore.getRecentStats(7));
          break;

        case '/api/events':
          this.sendJSON(res, this.monitorStore.getEvents(200));
          break;

        case '/api/experts':
          const experts = this.expertPool.listExperts();
          this.sendJSON(res, experts);
          break;

        case '/api/squads':
          const squads = this.expertPool.listSquads();
          this.sendJSON(res, squads);
          break;

        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
      }
    } catch (err: any) {
      console.error('[MonitorServer] API 错误:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /** 提供静态文件 */
  private serveStatic(pathname: string, res: http.ServerResponse): void {
    // 默认提供 index.html
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, '../../web/public', filePath);

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  /** 发送 JSON 响应 */
  private sendJSON(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }
}
