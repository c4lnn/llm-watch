# AGENTS.md

## 项目概述

LLM Watch 是一个中转监控系统，用于监控上游中转站的分组倍率、站点余额和可用状态，定时轮询并在关键变化时发送通知。

## 技术栈

- 后端：Node.js + Express + sql.js + node-cron
- 前端：React + TailwindCSS（react-scripts）
- 数据库：SQLite（sql.js，数据文件默认位于 `data/monitor.db`）
- 配置：`config.yaml`（本地敏感配置，不提交）
- 规格与变更记录：OpenSpec（`openspec/` 需要随项目提交）

## 常用命令

```bash
npm install       # 安装依赖
npm run dev       # 前后端同时启动
npm run server    # 仅启动后端：http://localhost:8888
npm run client    # 仅启动前端：http://localhost:3000
npm test          # 运行 Node 测试
npm run build     # 构建前端到 client/build
npm start         # 启动后端并提供已构建的前端静态文件
```

## 开发流程

修改后端代码后，主动重启后端服务并验证可用。

PowerShell 示例：

```powershell
netstat -ano | findstr ":8888"
taskkill /F /PID <pid>
npm run server
```

修改前端代码后，开发模式下 `react-scripts` 会自动热更新；如需验证生产产物，执行 `npm run build`。

同时修改前后端时，重启后端并刷新浏览器。

## 项目结构

```text
server/
  index.js        # Express 服务与 API 路由
  config.js       # YAML 配置加载
  db.js           # SQLite 初始化、迁移和数据访问
  poller.js       # 定时轮询、快照和变化检测
  adapters.js     # 中转类型适配器（sub2api / new-api）
  notifier.js     # 通知推送
  balanceAlerts.js # 余额阈值提醒逻辑
  logger.js       # 日志时间戳

client/src/
  App.jsx                    # 主框架与标签页路由
  api.js                     # Axios API 封装
  components/
    Dashboard.jsx            # 仪表盘
    UpstreamList.jsx         # 中转列表
    ChangeHistory.jsx        # 变更记录
    NotificationSettings.jsx # 通知配置

openspec/
  specs/             # 已同步的主规格
  changes/archive/   # 已完成变更的归档记录
```

## 关键约束

- 所有 SQL 必须使用参数化查询，禁止拼接用户输入。
- 中转、通知渠道等敏感配置以 `config.yaml` 为准，`config.yaml` 不提交；示例配置维护在 `config.example.yaml`。
- 前端可以保留启用/禁用等非敏感状态操作，但不能暴露密码、Token、通知密钥等敏感字段。
- 新增中转类型时，在 `server/adapters.js` 添加 adapter，并同步更新前端类型展示和测试。
- 涉及余额展示或提醒时，注意不同中转类型的额度单位换算；`new-api` 的剩余额度需要按比例换算后再展示和判断阈值。
- 通过浏览器前端操作中转配置相关流程，避免在 Windows Git Bash 中用 `curl` 发送中文导致编码问题。

## OpenSpec 协作约定

- 需求设计、任务拆分和归档记录需要保存在 `openspec/` 并提交到仓库。
- 新功能或行为变更优先通过 OpenSpec 创建 change，再实现、同步规格并归档。
- 已归档的 change 不要随意改写；如需修正历史说明，新增后续变更记录。

## 提交约定

- 使用清晰的中文或英文 commit message，标题概括用户可见变化。
- 多个相关任务合并在一个提交时，在提交正文列出主要事项。
- 提交前至少运行与改动相关的测试；涉及前端构建时运行 `npm run build`。
