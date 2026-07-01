## 背景

当前 Bark 通知发送由 `server/notifier.js` 的 `sendBark` 负责，URL 参数中固定写入 `group=monitor`。通知渠道已经从 `config.yaml` 的 `notifications` 数组加载，Bark channel 的 `config` 当前包含 `server` 和 `key`，前端 API 展示时会对 `key` 做脱敏。

Bark 的 group 是渠道级发送参数，不是上游中转名称。它适合由部署者在 `config.yaml` 中按渠道配置，而不是从通知标题或正文中推导。

## 目标 / 非目标

**目标：**

- 允许 Bark channel 在 `config.yaml` 的 `config.group` 中配置 Bark group 名。
- 未配置或配置为空时使用默认 group `LLM Watch`。
- 测试发送和真实通知发送使用同一套 Bark group 解析逻辑。
- 前端通知渠道列表需要在 Bark channel 摘要中展示非敏感的 Bark group 配置，帮助用户确认当前分组名。

**非目标：**

- 不把 Bark group 改成上游中转名或通知标题。
- 不新增前端编辑 Bark group 的能力；通知渠道仍由 `config.yaml` 管理。
- 不改变 Bark 的 `sound`、title、body 或其他通知渠道行为。

## 技术决策

1. 在 Bark channel 的 `config` 中增加可选 `group` 字段。

   原因：`group` 是 Bark 渠道自身的发送参数，和 `server`、`key` 同属渠道配置。放在 `config.yaml` 能符合项目中通知渠道由服务端配置管理的约定。

   备选方案：使用 notification channel 的 `id` 作为 group。该方案不需要新字段，但会把内部渠道标识暴露成 Bark 分组名，用户无法独立命名。

2. `sendBark` 使用 `config.group || 'LLM Watch'` 作为默认解析规则，并通过 URL 查询参数编码。

   原因：默认分组名需要体现应用名称，同时避免中文、空格等 group 名在 URL 中产生编码问题。实现时应使用结构化 URL 参数或等价的编码方式，不手写未编码查询串。

   备选方案：要求所有 Bark 配置必须显式提供 `group`。该方案会破坏现有配置，不符合兼容目标。

3. API 脱敏展示 Bark `group`，继续隐藏真实 `key`。

   原因：`group` 不是密钥，展示它能让前端通知设置页反映实际配置；`key` 仍然必须脱敏。

4. `NotificationSettings` 的 Bark channel 摘要显示当前 group 名。

   原因：仅让 API 返回 group 还不够，用户需要在通知设置页直接看到 Bark 服务端实际会收到的分组名。摘要沿用现有 `server / key` 信息展示方式，追加 `Group <name>`，不新增编辑入口。

## 风险 / 取舍

- [风险] 用户配置空字符串或只包含空白时，Bark 服务端仍可能看到空 group。→ 缓解：实现时对 `group` 做字符串 trim，空值回退到 `LLM Watch`。
- [风险] group 名包含中文或特殊字符时 URL 解析失败。→ 缓解：使用 `URLSearchParams` 或 `encodeURIComponent` 编码查询参数。
- [风险] 前端展示 group 可能被误认为可在线编辑。→ 缓解：通知设置页现有文案仍说明通知渠道来自 `config.yaml`，不新增编辑入口。

## 迁移计划

无需数据库迁移。现有 `config.yaml` 不需要修改，未配置 `group` 的 Bark channel 会发送默认 `group=LLM Watch`。部署者如需自定义，可在对应 Bark channel 的 `config` 中增加：

```yaml
group: LLM Watch
```

## 待确认问题

无。
