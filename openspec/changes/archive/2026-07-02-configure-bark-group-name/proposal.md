## Why

Bark 推送当前固定使用 `group=monitor`，导致 Bark 服务端或客户端里看到的推送分组无法区分不同使用场景。
将 Bark group 名放到 `config.yaml` 中配置，可以让部署者按自己的命名习惯管理 Bark 推送分组，同时保留现有默认行为。

## What Changes

- Bark 通知渠道 SHALL 支持在 `config.yaml` 的 channel `config` 中配置可选 `group` 字段。
- 未配置 `group` 时，Bark 推送 SHALL 使用默认值 `LLM Watch`。
- Bark 推送 URL SHALL 使用配置的 group 参数，而不是硬编码 `monitor`。
- 通知设置页 SHALL 在 Bark channel 摘要中显示当前 group 名，便于用户确认实际推送分组。
- 通知标题和正文保持现有语义，不把 Bark group 与上游中转名称混用。
- 示例配置和相关测试需要覆盖配置 group 与默认 group 两种情况。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `yaml-notification-configuration`: YAML 管理的 Bark 通知渠道需要支持配置 Bark group 名。

## Impact

- 影响 `server/notifier.js` 中 Bark URL 参数拼接逻辑。
- 影响 `server/config.js` 中 Bark 通知配置对前端 API 的脱敏展示。
- 影响 `client/src/components/NotificationSettings.jsx` 中 Bark channel 摘要展示。
- 影响 `config.example.yaml` 中 Bark 通知配置示例。
- 需要更新通知配置测试，验证配置 group、默认 `LLM Watch`、以及前端 API 不暴露敏感 key 的行为。
