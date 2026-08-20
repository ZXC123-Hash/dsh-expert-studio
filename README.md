# DeepSeek Harness 多Agent协作工作室插件

> 通过对话创造专家、组建专家团，让多 Agent 协作完成复杂任务。

## ✨ 功能

- **创造模式**：通过对话式交互创建/编辑专家与专家团，AI 自动生成档案
- **协作模式**：选择专家/专家团，以团长调度多专家协作执行任务
- **专家池**：共享存储，创造模式写入 → 协作模式实时读取
- **记忆库道具**：专家可绑定 Obsidian 知识库，支持搜索/读/写/链接解析
- **模型路由**：每个专家可绑定多个 API/模型，按任务复杂度自动调配
- **实时监控**：Token 用量、模型、渠道一目了然

## 📐 四层架构

```
入口层 → 预设选择器（创造模式 / 协作模式）
存储层 → 专家池（文件型 YAML，实时联动）
协作层 → 团长调度引擎（任务拆解→分配→并行/串行→整合）
能力层 → 技能 + 道具（动态工具注入）
```

## 🚀 安装

```bash
dsh plugin --profile web add dsh-expert-studio
```

## 🎮 使用

### 创造模式
```
/expert create
> 我要创建一个擅长产品设计的专家
```

### 协作模式
```
/expert collaborate
> 让产品设计专家和文案专家一起帮我做一个 landing page
```

## 📁 项目结构

```
src/
├── index.ts          # 插件入口
├── types.ts          # 类型定义（专家/专家团档案）
├── pool/             # 专家池 CRUD
├── create/           # 创造模式（AI 生成档案）
├── collab/           # 协作模式（团长调度）
├── tools/            # 注册的工具集
└── memory/           # 记忆压缩层（可选）
presets/
├── create-mode/      # 创造模式预设
└── collab-mode/      # 协作模式预设
```

## 🔧 工具清单

| 工具 | 功能 |
|---|---|
| `expert_list` | 列出所有专家 |
| `expert_get` | 查看专家完整档案 |
| `expert_search` | 按关键词搜索专家 |
| `expert_delete` | 删除专家 |
| `squad_list` | 列出所有专家团 |
| `squad_get` | 查看专家团详情 |
| `create_start` | 开始创造会话 |
| `create_message` | 在创造会话中对话 |
| `create_confirm` | 确认档案入库 |
| `collab_start` | 启动协作会话 |
| `collab_plan` | 团长规划任务 |
| `collab_execute` | 执行任务计划 |
| `collab_synthesize` | 整合最终结果 |
| `collab_monitor` | 实时监控面板 |
| `ob_list_notes` | 列出 OB 笔记 |
| `ob_read_note` | 读取 OB 笔记 |
| `ob_write_note` | 写入 OB 笔记 |
| `ob_search` | 全文搜索 OB 库 |
| `ob_backlinks` | 查看反向链接 |
| `ob_stats` | 知识库统计 |
| `memory_store` | 存储压缩观察 |
| `memory_recall` | 召回相关记忆 |
| `memory_stats` | 记忆总线统计 |

## 📋 开发状态

- [x] 阶段1：骨架搭建
- [x] 阶段2：专家池 CRUD
- [x] 阶段3：创造模式
- [x] 阶段4：记忆库道具（OB 文件直读 + 记忆压缩层）
- [x] 阶段5：协作模式（团长调度框架）
- [ ] 阶段6：能力集成（LLM 运行时接入 + agency-agents 导入）
- [ ] 阶段7：Web UI 监控面板
- [ ] 阶段8：测试
- [ ] 阶段9：打包发布

## 📄 License

MIT
