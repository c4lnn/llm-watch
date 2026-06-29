# LLMWatch — AI 大模型中转监控

监控各家上游中转站的分组倍率，定时轮询，倍率变动时推送通知。

## 功能

- 📊 仪表盘 — 实时查看所有中转的分组倍率，变动高亮
- 🔗 中转管理 — 查看中转配置，手动轮询（配置通过服务器文件管理）
- 📈 变动记录 — 倍率变化历史追踪
- 🔔 通知推送 — 支持 Bark（更多渠道开发中）

## 快速开始

### 1. 配置中转

复制示例配置文件并填入实际信息：

```bash
cp config.example.yaml config.yaml
```

编辑 `config.yaml`：

```yaml
upstreams:
  - name: 我的中转站                    # 显示名称（必填）
    base_url: https://api.example.com  # 中转站 API 地址（必填）
    type: sub2api                      # adapter 类型（必填：sub2api / new-api）
    email: user@example.com            # 登录账号（必填）
    password: your-password-here       # 登录密码（必填）
    poll_interval: 60                  # 轮询间隔（秒），默认 60
    enabled: true                      # 是否启用，默认 true
```

### 2. 启动服务

```bash
# 安装依赖
npm install

# 开发模式（前后端同时启动）
npm run dev

# 或分别启动
npm run server   # 后端 http://localhost:8888
npm run client   # 前端 http://localhost:3000

# 生产构建
npm run build    # 构建前端到 client/build
npm start        # 启动服务（同时提供前端静态文件）
```

### 3. Docker 部署

```bash
# 创建配置文件
cp config.example.yaml config.yaml
# 编辑 config.yaml 填入实际配置

# 启动
docker compose up -d
```

## 支持的中转类型

| 类型 | 登录方式 | 分组 API |
|------|----------|----------|
| sub2api | `POST /api/v1/auth/login` | `GET /api/v1/groups/available` |
| new-api | `POST /api/user/login` | `GET /api/user/self/groups` |

## 项目结构

```
server/
  index.js       # Express 服务 + API 路由
  config.js      # YAML 配置文件加载
  db.js          # SQLite 数据库初始化
  poller.js      # 轮询逻辑（变更检测、快照管理）
  adapters.js    # 中转类型适配器（sub2api / new-api）
  notifier.js    # 通知推送（Bark）
  logger.js      # 日志时间戳

client/src/
  App.jsx                    # 主框架（标签页路由）
  api.js                     # Axios 封装
  components/
    Dashboard.jsx            # 仪表盘（按中转分组展示倍率）
    UpstreamList.jsx         # 中转列表（只读 + 手动轮询）
    ChangeHistory.jsx        # 倍率变动记录
    NotificationSettings.jsx # 通知渠道配置
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/upstreams` | 中转列表（只读） |
| POST | `/api/upstreams/:id/poll` | 单个轮询 |
| POST | `/api/poll` | 全部轮询 |
| POST | `/api/test` | 测试连接 |
| GET | `/api/upstreams/:id/groups` | 分组列表 |
| GET | `/api/upstreams/:id/groups/:name/history` | 分组倍率历史 |
| GET | `/api/upstreams/:uid/groups/:gid/diff` | 分组变动对比 |
| GET | `/api/stats` | 仪表盘数据 |
| GET | `/api/changes` | 变动记录 |
| GET | `/api/notifications` | 通知渠道列表 |
| POST | `/api/notifications` | 添加通知渠道 |
| PUT | `/api/notifications/:id` | 更新通知渠道 |
| DELETE | `/api/notifications/:id` | 删除通知渠道 |
| POST | `/api/notifications/test` | 测试通知 |

> ⚠️ 中转配置通过服务器 `config.yaml` 文件管理，前端无法新增/修改/删除中转。

## 技术栈

- **后端**: Node.js + Express + sql.js + node-cron
- **前端**: React + TailwindCSS
- **数据库**: SQLite（sql.js，纯 JS 实现）
- **配置**: YAML（yaml 包）

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8888` | 服务端口 |
| `CONFIG_PATH` | `./config.yaml` | 配置文件路径 |
| `TZ` | - | 时区（Docker 建议设为 `Asia/Shanghai`） |
