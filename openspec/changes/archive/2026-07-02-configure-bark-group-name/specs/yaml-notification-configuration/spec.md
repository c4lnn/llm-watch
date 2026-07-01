## ADDED Requirements

### Requirement: Bark group 名可由 YAML 配置
系统 SHALL 允许通过 `config.yaml` 中 Bark 通知渠道的 `config.group` 配置 Bark 推送的 group 名。

#### Scenario: Bark channel 配置了 group
- **WHEN** `config.yaml` 中的 Bark notification channel 配置了非空 `config.group`
- **THEN** 系统发送 Bark 推送时使用该 `group` 查询参数

#### Scenario: Bark channel 未配置 group
- **WHEN** `config.yaml` 中的 Bark notification channel 未配置 `config.group` 或配置为空
- **THEN** 系统发送 Bark 推送时使用默认 group `LLM Watch`

#### Scenario: 前端查看 Bark channel 配置
- **WHEN** 前端请求通知渠道列表
- **THEN** 系统返回 Bark channel 的非敏感 `group` 配置
- **AND** 系统继续隐藏 Bark `key` 的完整值
- **AND** 通知设置页在该 Bark channel 摘要中显示当前 group 名

#### Scenario: 用户测试 Bark channel
- **WHEN** 用户触发配置了 `group` 的 Bark channel 测试发送
- **THEN** 测试推送使用该 channel 的 `group` 查询参数
