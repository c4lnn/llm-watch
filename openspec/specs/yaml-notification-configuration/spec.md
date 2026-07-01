## Purpose

Defines server-managed notification channels loaded from `config.yaml`.

## Requirements

### Requirement: Load notification channels from YAML
The system SHALL load notification channel definitions from `config.yaml`.

#### Scenario: Valid notification config is loaded
- **WHEN** `config.yaml` contains a valid `notifications` array
- **THEN** the system exposes those notification channels as configured channels

#### Scenario: Enabled defaults to true
- **WHEN** a notification channel omits the `enabled` field
- **THEN** the system treats the channel as enabled unless a stored runtime override disables it

### Requirement: Preserve frontend enable and disable control
The system SHALL allow users to enable or disable configured notification channels from the frontend.

#### Scenario: User disables a configured channel
- **WHEN** a user disables a configured notification channel from the notification settings page
- **THEN** the system persists the disabled runtime state without modifying `config.yaml`

#### Scenario: User enables a configured channel
- **WHEN** a user enables a configured notification channel from the notification settings page
- **THEN** the system persists the enabled runtime state without modifying `config.yaml`

### Requirement: Remove frontend channel deletion
The system SHALL NOT provide notification channel deletion as a frontend workflow.

#### Scenario: Notification settings page renders configured channels
- **WHEN** the notification settings page displays configured notification channels
- **THEN** each channel has enable or disable controls and no delete control

#### Scenario: Delete API is attempted
- **WHEN** a client attempts to delete a config-managed notification channel
- **THEN** the system rejects the delete attempt and leaves the configured channel available

### Requirement: Remove frontend channel creation
The system SHALL NOT provide notification channel creation as a frontend workflow when notifications are config-managed.

#### Scenario: Notification settings page loads
- **WHEN** the notification settings page loads
- **THEN** it does not show an add notification form or modal trigger

### Requirement: Send notifications using config-managed channels
The system SHALL send push notifications through enabled channels loaded from `config.yaml`.

#### Scenario: Enabled configured channel receives notification
- **WHEN** a group change notification is sent and a configured channel is enabled
- **THEN** the system sends the push through that configured channel

#### Scenario: Disabled configured channel is skipped
- **WHEN** a group change notification is sent and a configured channel is disabled by runtime state
- **THEN** the system does not send the push through that channel

### Requirement: Test configured notification channels
The system SHALL allow users to test configured notification channels without entering channel secrets in the frontend.

#### Scenario: User tests configured channel
- **WHEN** a user triggers a test send for a configured notification channel
- **THEN** the system sends the test using the server-side configured channel data

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
