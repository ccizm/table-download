const DEFAULTS = {
  excludedUrls: [],
  buttonColor: 'rgba(65, 117, 5, 1)',
  iconColor: '#FFFFFF',
  buttonSize: 20,
};

function t(key, fallback, subs) {
  try {
    const msg = chrome.i18n.getMessage(key, subs);
    return msg || fallback || key;
  } catch (_) {
    return fallback || key;
  }
}

function applyI18n() {
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.textContent = t('options_title', '表格下载器设置');
  try { document.title = t('options_title', '表格下载器设置'); } catch (_) {}

  const excludedLabel = document.getElementById('excludedUrlsLabel');
  if (excludedLabel) excludedLabel.textContent = t('options_excludedUrls_label', '排除显示的网址（每行一个，支持包含匹配）');
  const excludedTa = document.getElementById('excludedUrls');
  if (excludedTa) excludedTa.placeholder = t('options_excludedUrls_placeholder', '例如：\nexample.com\nhttps://foo.bar/path');
  const excludedHint = document.getElementById('excludedUrlsHint');
  if (excludedHint) excludedHint.textContent = t('options_excludedUrls_hint', '含有这些片段的网址将不显示悬浮下载按钮。');

  const buttonColorLabel = document.getElementById('buttonColorLabel');
  if (buttonColorLabel) buttonColorLabel.textContent = t('options_buttonColor_label', '按钮颜色');
  const iconColorLabel = document.getElementById('iconColorLabel');
  if (iconColorLabel) iconColorLabel.textContent = t('options_iconColor_label', '图标颜色');
  const buttonSizeLabel = document.getElementById('buttonSizeLabel');
  if (buttonSizeLabel) buttonSizeLabel.textContent = t('options_buttonSize_label', '按钮大小（图标像素）');
  const buttonSizeHint = document.getElementById('buttonSizeHint');
  if (buttonSizeHint) buttonSizeHint.textContent = t('options_buttonSize_hint', '大小控制图标宽高（默认 20px）。');

  const saveBtn = document.getElementById('save');
  if (saveBtn) saveBtn.textContent = t('options_save', '保存');
  const resetBtn = document.getElementById('reset');
  if (resetBtn) resetBtn.textContent = t('options_reset', '恢复默认');
}

function loadOptions() {
  chrome.storage.sync.get(DEFAULTS, (conf) => {
    const { excludedUrls, buttonColor, iconColor, buttonSize } = conf || DEFAULTS;
    const ta = document.getElementById('excludedUrls');
    ta.value = (excludedUrls || []).join('\n');
    document.getElementById('buttonColor').value = toHexColor(buttonColor) || '#417505';
    document.getElementById('iconColor').value = toHexColor(iconColor) || '#FFFFFF';
    document.getElementById('buttonSize').value = String(buttonSize || 20);
  });
}

function saveOptions() {
  const ta = document.getElementById('excludedUrls');
  const excludedUrls = (ta.value || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  const buttonColor = document.getElementById('buttonColor').value || DEFAULTS.buttonColor;
  const iconColor = document.getElementById('iconColor').value || DEFAULTS.iconColor;
  const buttonSize = Math.max(12, Math.min(48, parseInt(document.getElementById('buttonSize').value, 10) || DEFAULTS.buttonSize));

  chrome.storage.sync.set({ excludedUrls, buttonColor, iconColor, buttonSize }, () => {
    alert(t('options_saved_alert', '已保存设置'));
  });
}

function resetOptions() {
  chrome.storage.sync.set(DEFAULTS, () => {
    loadOptions();
    alert(t('options_reset_alert', '已恢复默认设置'));
  });
}

function toHexColor(c) {
  // Accept hex or rgba; convert rgba to hex
  if (!c) return '';
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  const m = c.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i);
  if (!m) return '';
  const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
  const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
  const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  loadOptions();
  document.getElementById('save').addEventListener('click', saveOptions);
  document.getElementById('reset').addEventListener('click', resetOptions);
});