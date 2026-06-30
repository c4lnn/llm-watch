const { sendNotification } = require('./notifier');
const {
  getEffectiveBalanceAlertSettings,
  getBalanceAlertState,
  upsertBalanceAlertState,
} = require('./db');

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getComparableBalanceValue(accountStatus) {
  return toFiniteNumber(accountStatus?.displayValue) ?? toFiniteNumber(accountStatus?.balance);
}

function isCooldownElapsed(lastAlertAt, now, cooldownMinutes) {
  if (!lastAlertAt) return true;
  const lastMs = new Date(lastAlertAt).getTime();
  if (!Number.isFinite(lastMs)) return true;
  return new Date(now).getTime() - lastMs >= Math.max(0, Number(cooldownMinutes) || 0) * 60 * 1000;
}

function formatAlertValue(value, unit = '') {
  const formatted = Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function buildLowBalanceBody(upstream, value, threshold, accountStatus, isReminder) {
  const label = accountStatus.label || (upstream.type === 'new-api' ? '额度' : '余额');
  const title = isReminder ? '仍低于阈值' : '低于阈值';
  return [
    `${upstream.name} ${label}${title}`,
    `${label}: ${formatAlertValue(value, accountStatus.displayUnit)}`,
    `阈值: ${formatAlertValue(threshold, accountStatus.displayUnit)}`,
    `时间: ${new Date().toLocaleString('zh-CN')}`,
  ].join('\n');
}

function buildRecoveryBody(upstream, value, threshold, accountStatus) {
  const label = accountStatus.label || (upstream.type === 'new-api' ? '额度' : '余额');
  return [
    `${upstream.name} ${label}已恢复`,
    `${label}: ${formatAlertValue(value, accountStatus.displayUnit)}`,
    `阈值: ${formatAlertValue(threshold, accountStatus.displayUnit)}`,
    `时间: ${new Date().toLocaleString('zh-CN')}`,
  ].join('\n');
}

async function evaluateBalanceAlert(upstream, accountStatus, now = new Date().toISOString()) {
  if (!upstream?.id || accountStatus?.status === 'unsupported' || accountStatus?.status === 'failed') {
    return { action: 'skipped', reason: 'unsupported_or_failed' };
  }

  const value = getComparableBalanceValue(accountStatus);
  if (value == null) return { action: 'skipped', reason: 'non_finite_value' };

  const settings = getEffectiveBalanceAlertSettings(upstream.id);
  const threshold = toFiniteNumber(settings.threshold);
  if (!settings.enabled) {
    upsertBalanceAlertState(upstream.id, {
      state: 'normal',
      last_value: value,
      threshold,
    });
    return { action: 'skipped', reason: 'disabled', value, threshold };
  }
  if (threshold == null || threshold <= 0) {
    upsertBalanceAlertState(upstream.id, {
      state: 'normal',
      last_value: value,
      threshold,
    });
    return { action: 'skipped', reason: 'no_threshold', value, threshold };
  }

  const previous = getBalanceAlertState(upstream.id);
  const previousState = previous?.state === 'low' ? 'low' : 'normal';
  const isLow = value < threshold;

  if (isLow && previousState === 'normal') {
    await sendNotification(
      `余额提醒 - ${upstream.name}`,
      buildLowBalanceBody(upstream, value, threshold, accountStatus, false)
    );
    upsertBalanceAlertState(upstream.id, {
      state: 'low',
      last_value: value,
      threshold,
      last_alert_at: now,
    });
    return { action: 'low_alert', value, threshold };
  }

  if (isLow && previousState === 'low') {
    if (isCooldownElapsed(previous?.last_alert_at, now, settings.cooldown_minutes)) {
      await sendNotification(
        `余额提醒 - ${upstream.name}`,
        buildLowBalanceBody(upstream, value, threshold, accountStatus, true)
      );
      upsertBalanceAlertState(upstream.id, {
        state: 'low',
        last_value: value,
        threshold,
        last_alert_at: now,
      });
      return { action: 'low_reminder', value, threshold };
    }

    upsertBalanceAlertState(upstream.id, {
      state: 'low',
      last_value: value,
      threshold,
    });
    return { action: 'cooldown_suppressed', value, threshold };
  }

  if (!isLow && previousState === 'low') {
    if (settings.notify_recovery) {
      await sendNotification(
        `余额恢复 - ${upstream.name}`,
        buildRecoveryBody(upstream, value, threshold, accountStatus)
      );
      upsertBalanceAlertState(upstream.id, {
        state: 'normal',
        last_value: value,
        threshold,
        last_recovery_at: now,
      });
      return { action: 'recovery_alert', value, threshold };
    }

    upsertBalanceAlertState(upstream.id, {
      state: 'normal',
      last_value: value,
      threshold,
    });
    return { action: 'recovered_silent', value, threshold };
  }

  upsertBalanceAlertState(upstream.id, {
    state: 'normal',
    last_value: value,
    threshold,
  });
  return { action: 'normal', value, threshold };
}

module.exports = {
  evaluateBalanceAlert,
  _test: {
    getComparableBalanceValue,
    isCooldownElapsed,
    buildLowBalanceBody,
    buildRecoveryBody,
  },
};
