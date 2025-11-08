const DEFAULTS = {
  excludedUrls: [],
};

function t(key, fallback, subs) {
  try {
    const msg = chrome.i18n.getMessage(key, subs);
    return msg || fallback || key;
  } catch (_) {
    return fallback || key;
  }
}

function queryActiveTab() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0]);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function loadSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(DEFAULTS, (conf) => resolve(conf || DEFAULTS));
    } catch (e) {
      resolve(DEFAULTS);
    }
  });
}

function saveSettings(conf) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.set(conf, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

function normalizeList(list) {
  const arr = (list || []).map(s => String(s || '').trim()).filter(Boolean);
  return Array.from(new Set(arr));
}

function computeStatus(url, list) {
  const matched = (list || []).find(piece => piece && url.includes(piece));
  return { excluded: Boolean(matched), matched };
}

async function init() {
  const tab = await queryActiveTab();
  const titleEl = document.querySelector('h1');
  const urlEl = document.getElementById('url');
  const statusEl = document.getElementById('status');
  const toggleBtn = document.getElementById('toggleExclude');
  const openOptionsBtn = document.getElementById('openOptions');
  const hintEl = document.querySelector('.hint');

  const url = (tab && tab.url) || '';
  if (titleEl) titleEl.textContent = t('popup_title', '站点排除设置');
  urlEl.textContent = url ? `${t('popup_current_page_prefix', '当前页面：')}${url}` : t('popup_current_page_prefix', '当前页面：');
  if (hintEl) hintEl.textContent = t('popup_hint', '说明：排除后此站点将不显示悬浮下载按钮。');
  if (openOptionsBtn) openOptionsBtn.textContent = t('popup_open_options', '打开设置');

  const conf = await loadSettings();
  conf.excludedUrls = normalizeList(conf.excludedUrls);

  let host = '';
  let origin = '';
  try {
    const u = new URL(url);
    host = u.host;
    origin = u.origin;
  } catch (_) {}

  const { excluded, matched } = computeStatus(url, conf.excludedUrls);
  renderStatus(statusEl, excluded, matched);
  renderButton(toggleBtn, excluded, matched, host);

  toggleBtn.onclick = async () => {
    // 每次点击时重新读取最新设置，确保二次点击生效
    const latest = await loadSettings();
    latest.excludedUrls = normalizeList(latest.excludedUrls);
    const current = computeStatus(url, latest.excludedUrls);
    let list = latest.excludedUrls.slice();

    if (current.excluded) {
      // 取消排除：移除导致命中的规则（不论规则是 host、origin 或片段）
      list = list.filter(x => x !== current.matched);
      latest.excludedUrls = normalizeList(list);
      await saveSettings(latest);
    } else {
      // 加入排除：优先使用 host；无法解析时使用完整 URL
      list.push(host || url);
      latest.excludedUrls = normalizeList(list);
      await saveSettings(latest);
    }

    const s = computeStatus(url, latest.excludedUrls);
    renderStatus(statusEl, s.excluded, s.matched);
    renderButton(toggleBtn, s.excluded, s.matched, host);
  };

  openOptionsBtn.onclick = () => {
    try { chrome.runtime.openOptionsPage(); } catch (_) {}
  };
}

function renderStatus(el, excluded, matched) {
  if (!el) return;
  if (excluded) {
    el.className = 'status excluded';
    el.textContent = matched
      ? t('popup_status_excluded_with_rule', '状态：已排除（匹配规则：$1）', [matched])
      : t('popup_status_excluded', '状态：已排除');
  } else {
    el.className = 'status ok';
    el.textContent = t('popup_status_ok', '状态：未排除（将显示悬浮下载按钮）');
  }
}

function renderButton(btn, excluded, matched, host) {
  if (!btn) return;
  if (excluded) {
    btn.textContent = t('popup_toggle_exclude_remove', '取消排除此站点');
    btn.disabled = false;
    btn.title = matched ? `${t('popup_status_excluded_with_rule', '状态：已排除（匹配规则：$1）', [matched])}` : '';
  } else {
    btn.textContent = t('popup_toggle_exclude_add', '排除此站点');
    btn.disabled = false;
    btn.title = host ? '' : t('popup_current_page_prefix', '当前页面：');
  }
}

document.addEventListener('DOMContentLoaded', init);