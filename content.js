// 标记已处理过的表格，避免重复添加按钮
const processedTables = new WeakSet();

// 国际化取文案
function t(key, fallback) {
  try {
    const msg = (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function')
      ? chrome.i18n.getMessage(key)
      : '';
    return msg || fallback || key;
  } catch (e) {
    return fallback || key;
  }
}

// 用户设置（从扩展设置页读取）
const DEFAULT_SETTINGS = {
  excludedUrls: [],
  buttonColor: 'rgba(65, 117, 5, 1)',
  iconColor: '#FFFFFF',
  buttonSize: 20,
};
let USER_SETTINGS = DEFAULT_SETTINGS;

function loadUserSettings() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (conf) => {
          USER_SETTINGS = Object.assign({}, DEFAULT_SETTINGS, conf || {});
          resolve(USER_SETTINGS);
        });
      } else {
        resolve(USER_SETTINGS);
      }
    } catch (_) {
      resolve(USER_SETTINGS);
    }
  });
}

function isExcludedBySettings(url) {
  const list = (USER_SETTINGS.excludedUrls || []).filter(Boolean);
  return list.some(piece => {
    try { return piece && url.includes(piece); } catch (_) { return false; }
  });
}

// 初始化：处理页面已有的表格 + 监听未来动态添加的表格
async function initTableDetector() {
  await loadUserSettings();
  // 如果当前网址命中排除列表，则不挂载按钮
  if (isExcludedBySettings(location.href)) {
    return;
  }
  // 处理初始加载的表格
  processExistingTables();
  // 监听DOM变化，检测动态添加的表格
  observeDOMChanges();
}

// 处理页面中已存在的表格
function processExistingTables() {
  const tables = document.querySelectorAll('table');
  tables.forEach(table => processTable(table));
}

// 监听DOM变化（检测动态生成的表格）
function observeDOMChanges() {
  // 配置观察选项：监听子节点变化和子树变化
  const observerOptions = {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  };

  // 创建观察者实例
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // 检查新增的节点中是否包含表格
      mutation.addedNodes.forEach(node => {
        // 如果新增节点是表格，直接处理
        if (node.tagName === 'TABLE') {
          processTable(node);
        }
        // 如果新增节点是容器，检查内部是否有表格
        else if (node.nodeType === 1) { // 元素节点
          // 处理各 UI 框架容器（统一调用避免重复）
          const frameworks = [
            { key: 'el', className: 'el-table' },
            { key: 'naive', className: 'n-data-table' },
            { key: 'ant', className: 'ant-table' },
            { key: 'ivu', className: 'ivu-table' },
            { key: 'arco', className: 'arco-table' },
            { key: 'tdesign', className: 't-table' },
          ];
          frameworks.forEach(fw => {
            if (node.classList && node.classList.contains(fw.className)) {
              processFrameworkTable(node, fw.key);
            }
            const found = node.querySelectorAll(`.${fw.className}`);
            found.forEach(el => processFrameworkTable(el, fw.key));
          });

          const tablesInNode = node.querySelectorAll('table');
          tablesInNode.forEach(table => processTable(table));
        }
      });
    });
  });

  // 开始观察整个文档的变化
  observer.observe(document.body, observerOptions);
}

// 处理单个表格（添加下载按钮，避免重复）
function processTable(table) {
  // 跳过已处理的表格或不可见的表格
  if (processedTables.has(table) || !isTableVisible(table)) {
    return;
  }

  // 跳过 UI 框架组件内部的子表，统一处理其容器
  const frameworks = [
    { key: 'el', className: 'el-table' },
    { key: 'naive', className: 'n-data-table' },
    { key: 'ant', className: 'ant-table' },
    { key: 'ivu', className: 'ivu-table' },
    { key: 'arco', className: 'arco-table' },
    { key: 'tdesign', className: 't-table' },
  ];
  for (const fw of frameworks) {
    const container = table.closest(`.${fw.className}`);
    if (container) {
      processFrameworkTable(container, fw.key);
      return;
    }
  }

  // 标记为已处理
  processedTables.add(table);
  
  // 添加下载按钮
  addDownloadButton(table);
}

// UI 框架容器处理（统一函数与配置）
const FRAMEWORK_CONFIG = {
  el: { className: 'el-table', getWrapper: (container) => container },
  naive: { className: 'n-data-table', getWrapper: (container) => container },
  ant: { className: 'ant-table', getWrapper: (container) => container.querySelector('.ant-table-container') || container },
  ivu: { className: 'ivu-table', getWrapper: (container) => container },
  arco: { className: 'arco-table', getWrapper: (container) => container.querySelector('.arco-table-container') || container },
  tdesign: { className: 't-table', getWrapper: (container) => container.querySelector('.t-table__content') || container },
};
const processedFrameworks = {
  el: new WeakSet(),
  naive: new WeakSet(),
  ant: new WeakSet(),
  ivu: new WeakSet(),
  arco: new WeakSet(),
  tdesign: new WeakSet(),
};
function processFrameworkTable(container, key) {
  const set = processedFrameworks[key];
  const cfg = FRAMEWORK_CONFIG[key];
  if (!set || !cfg) return;
  if (set.has(container) || !isElementVisible(container)) return;
  set.add(container);
  const wrapper = cfg.getWrapper(container);
  addFrameworkDownloadButton(wrapper);
}

// 检查表格是否可见（避免给隐藏表格添加按钮）
function isTableVisible(table) {
  const style = window.getComputedStyle(table);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    table.offsetParent !== null // 检查是否在DOM流中
  );
}

// 为表格添加下载按钮
function addDownloadButton(table) {
  // 确保表格有相对定位，使按钮能悬浮在右上角
  if (window.getComputedStyle(table).position === 'static') {
    table.style.position = 'relative';
  }

  // 创建下载按钮
  const button = document.createElement('div');
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
  button.className = 'table-download-btn';
  // 悬浮提示：使用国际化标题
  button.title = t('download_button_title', '点击下载，可拖动按钮');

  // 按钮样式
  button.style.cssText = `
    position: absolute;
    top: 5px;
    left: 5px;
    z-index: 9; /* 确保按钮在表格内容上方 */
    padding: 2px 4px;
    background-color: ${USER_SETTINGS.buttonColor};
    color: ${USER_SETTINGS.iconColor};
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.2;
    transition: opacity 0.2s, transform 0.2s;
  `;

  // 应用尺寸与图标颜色
  try {
    const svg = button.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(USER_SETTINGS.buttonSize) + 'px');
      svg.setAttribute('height', String(USER_SETTINGS.buttonSize) + 'px');
    }
  } catch (_) {}

  // 鼠标悬停效果
  button.addEventListener('mouseover', () => {
    button.style.opacity = '1';
    button.style.transform = 'scale(1.05)';
  });
  button.addEventListener('mouseout', () => {
    button.style.opacity = '0.7';
    button.style.transform = 'scale(1)';
  });

  // 仅横向拖动按钮（限制在表格内部）
  enableHorizontalDrag(button, table);

  // 点击事件（调用导出Excel的方法）
  button.addEventListener('click', (e) => {
    // 如果刚发生拖动，阻止点击触发
    if (button.dataset.dragMoved === 'true') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    // 打开轻量设置面板
    showSettingsPanel(table, button);
  });

  // 添加按钮到表格
  table.appendChild(button);
}

// 为 Element Plus 容器添加下载按钮
// 为 UI 框架容器添加下载按钮（统一函数）
function addFrameworkDownloadButton(wrapper) {
  if (window.getComputedStyle(wrapper).position === 'static') {
    wrapper.style.position = 'relative';
  }

  const button = document.createElement('div');
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
  button.className = 'table-download-btn';
  // 悬浮提示：使用国际化标题
  button.title = t('download_button_title', '点击下载，可拖动按钮');

  button.style.cssText = `
    position: absolute;
    top: 5px;
    left: 5px;
    z-index: 9;
    padding: 4px 8px;
    background-color: ${USER_SETTINGS.buttonColor};
    color: ${USER_SETTINGS.iconColor};
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.3;
    transition: opacity 0.2s, transform 0.2s;
  `;

  // 应用尺寸与图标颜色
  try {
    const svg = button.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(USER_SETTINGS.buttonSize) + 'px');
      svg.setAttribute('height', String(USER_SETTINGS.buttonSize) + 'px');
    }
  } catch (_) {}

  button.addEventListener('mouseover', () => {
    button.style.opacity = '1';
    button.style.transform = 'scale(1.05)';
  });
  button.addEventListener('mouseout', () => {
    button.style.opacity = '0.7';
    button.style.transform = 'scale(1)';
  });

  // 仅横向拖动按钮（限制在容器内部）
  enableHorizontalDrag(button, wrapper);

  button.addEventListener('click', (e) => {
    // 如果刚发生拖动，阻止点击触发
    if (button.dataset.dragMoved === 'true') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    showSettingsPanel(wrapper, button);
  });

  wrapper.appendChild(button);
}

// 使下载按钮可在容器内进行水平拖动
function enableHorizontalDrag(button, container) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startLeft = 0;

  const onPointerMove = (e) => {
    if (!dragging) return;
    const clientX = e.clientX;
    const dx = clientX - startX;
    if (Math.abs(dx) > 2) moved = true;
    let newLeft = startLeft + dx;
    const containerWidth = container.clientWidth || container.offsetWidth || 0;
    const maxLeft = Math.max(0, containerWidth - button.offsetWidth);
    if (newLeft < 0) newLeft = 0;
    if (newLeft > maxLeft) newLeft = maxLeft;
    button.style.left = `${Math.round(newLeft)}px`;
  };

  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    try { button.releasePointerCapture && button.releasePointerCapture(e.pointerId); } catch {}
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    // 标记刚发生拖动，短时内阻止点击
    button.dataset.dragMoved = moved ? 'true' : 'false';
    setTimeout(() => { button.dataset.dragMoved = 'false'; moved = false; }, 150);
  };

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // 仅左键
    dragging = true;
    moved = false;
    startX = e.clientX;
    startLeft = parseFloat(getComputedStyle(button).left) || 0;
    try { button.setPointerCapture && button.setPointerCapture(e.pointerId); } catch {}
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    e.preventDefault();
  });
}

// 工具：判断元素是否可见
function isElementVisible(el) {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetParent !== null &&
    rect.width > 0 && rect.height > 0
  );
}

// 工具：清洗文本
function cleanText(text) {
  return String(text || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 工具：提取单元格文本与链接
function extractCellTextAndLink(cell) {
  const text = cleanText(cell.textContent);
  const anchor = cell.querySelector('a[href]');
  let href = null;
  if (anchor) {
    const raw = anchor.getAttribute('href');
    if (raw && !/^javascript:/i.test(raw)) {
      href = raw;
    }
  }
  return { text, href };
}

// 工具：生成工作表名（限制31字符，移除非法字符）
function getSheetName(table) {
  const fromAttr = table.getAttribute('data-sheet-name');
  const raw = fromAttr || (table.caption ? table.caption.textContent : document.title || t('default_sheet_name','表格数据'));
  const cleaned = cleanText(raw).replace(/[\\\/:\*\?\[\]]/g, '');
  return cleaned.slice(0, 31) || t('default_sheet_name','表格数据');
}

// 提取表格结构数据，支持rowspan/colspan占位与Excel合并，还原超链接
// 返回 { data: string[][], merges: Array<{s:{r,c},e:{r,c}}>, links: Array<{r,c,href,tooltip?:string}> }
function extractTableData(table, options = {}) {
  const { onlyVisibleColumns = true, preserveHyperlinks = true } = options;
  const rows = Array.from(table.querySelectorAll('tr'));

  const data = [];
  const merges = [];
  const links = [];
  const rowSpanPlaceholders = new Map(); // rowIndex -> Set(colIndex)
  const visibleByColumn = new Map(); // colIndex -> boolean

  rows.forEach((rowEl, rIndex) => {
    const cells = Array.from(rowEl.querySelectorAll('th, td'));
    const rowArray = [];

    // 预填充来自上一行的rowspan占位
    const blocked = rowSpanPlaceholders.get(rIndex);
    if (blocked) {
      [...blocked].sort((a, b) => a - b).forEach(ci => {
        rowArray[ci] = '';
      });
    }

    let cIndex = 0;
    cells.forEach(cellEl => {
      // 跳过已占位的列
      while (rowArray[cIndex] !== undefined) cIndex++;

      const colSpan = parseInt(cellEl.colSpan) || 1;
      const rowSpan = parseInt(cellEl.rowSpan) || 1;
      const { text, href } = extractCellTextAndLink(cellEl);
      const isVisible = isElementVisible(cellEl);

      // 标记列可见性
      for (let k = 0; k < colSpan; k++) {
        const col = cIndex + k;
        const prev = visibleByColumn.get(col) || false;
        visibleByColumn.set(col, prev || isVisible);
      }

      // 放置当前单元格文本
      rowArray[cIndex] = text;

      // 列合并：当前行填充占位
      for (let k = 1; k < colSpan; k++) {
        rowArray[cIndex + k] = '';
      }

      // 超链接保留：仅在左上角单元格记录
      if (preserveHyperlinks && href) {
        links.push({ r: rIndex, c: cIndex, href, tooltip: text });
      }

      // 处理rowspan：未来行的占位，并记录合并范围
      if (rowSpan > 1 || colSpan > 1) {
        merges.push({
          s: { r: rIndex, c: cIndex },
          e: { r: rIndex + rowSpan - 1, c: cIndex + colSpan - 1 }
        });

        for (let rOff = 1; rOff < rowSpan; rOff++) {
          const targetRow = rIndex + rOff;
          let set = rowSpanPlaceholders.get(targetRow);
          if (!set) {
            set = new Set();
            rowSpanPlaceholders.set(targetRow, set);
          }
          for (let cOff = 0; cOff < colSpan; cOff++) {
            set.add(cIndex + cOff);
          }
        }
      }

      // 移动到下一潜在列
      cIndex++;
    });

    if (rowArray.length > 0) {
      data.push(rowArray.map(v => (v === undefined ? '' : v)));
    }
  });

  // 仅导出可见列：构建索引映射
  let filteredData = data;
  let filteredMerges = merges;
  let filteredLinks = links;
  if (onlyVisibleColumns) {
    const maxLen = Math.max(0, ...data.map(r => r.length));
    const visibleCols = Array.from({ length: maxLen }, (_, i) => !!visibleByColumn.get(i));
    const indexMap = new Map();
    let newIdx = 0;
    visibleCols.forEach((isVis, oldIdx) => {
      if (isVis) indexMap.set(oldIdx, newIdx++);
    });

    // 过滤数据
    filteredData = data.map(row => row.filter((_, oldIdx) => indexMap.has(oldIdx)));

    // 映射合并范围（移除完全不可映射的）
    filteredMerges = merges
      .map(m => {
        const sC = indexMap.get(m.s.c);
        const eC = indexMap.get(m.e.c);
        if (sC === undefined || eC === undefined) return null;
        return { s: { r: m.s.r, c: sC }, e: { r: m.e.r, c: eC } };
      })
      .filter(Boolean);

    // 映射链接
    filteredLinks = links
      .map(l => {
        const cNew = indexMap.get(l.c);
        if (cNew === undefined) return null;
        return { ...l, c: cNew };
      })
      .filter(Boolean);
  }

  return { data: filteredData, merges: filteredMerges, links: filteredLinks };
}

// 提取 Element Plus el-table 数据：合并表头和主体
function extractElTableData(container, options = {}) {
  const headerTable = container.querySelector('.el-table__header');
  const bodyTable = container.querySelector('.el-table__body');
  const header = headerTable ? extractTableData(headerTable, { ...options, onlyVisibleColumns: options.onlyVisibleColumns !== false }) : { data: [], merges: [], links: [] };
  const body = bodyTable ? extractTableData(bodyTable, options) : { data: [], merges: [], links: [] };

  // 将 header 的列可见性与 body 对齐：extractTableData 已在各自内部做过滤，这里直接拼接
  return {
    data: [...header.data, ...body.data],
    merges: [...(header.merges || []), ...(body.merges || [])],
    links: [...(header.links || []), ...(body.links || [])]
  };
}

// 统一提取选择逻辑：根据目标类型和所处容器自动选择对应提取函数
function extractStructured(target, options = {}) {
  const hasClass = (cls) => target.classList && target.classList.contains(cls);
  const closest = (sel) => (typeof target.closest === 'function') ? target.closest(sel) : null;

  // Ant Design 容器或其内部组件
  if (hasClass('ant-table') || hasClass('ant-table-container')) {
    const container = hasClass('ant-table') ? target : (closest('.ant-table') || target);
    return extractAntTableData(container, options);
  }
  const antAncestor = closest('.ant-table');
  if (antAncestor) return extractAntTableData(antAncestor, options);

  // Element Plus 容器或其内部组件
  if (hasClass('el-table')) return extractElTableData(target, options);
  const elAncestor = closest('.el-table');
  if (elAncestor) return extractElTableData(elAncestor, options);

  // Naive UI 容器或其内部组件
  if (hasClass('n-data-table')) return extractNaiveTableData(target, options);
  const naiveAncestor = closest('.n-data-table');
  if (naiveAncestor) return extractNaiveTableData(naiveAncestor, options);

  // View UI / iView / View UI Plus
  if (hasClass('ivu-table')) return extractIvuTableData(target, options);
  const ivuAncestor = closest('.ivu-table');
  if (ivuAncestor) return extractIvuTableData(ivuAncestor, options);

  // Arco Design
  if (hasClass('arco-table')) return extractArcoTableData(target, options);
  const arcoAncestor = closest('.arco-table');
  if (arcoAncestor) return extractArcoTableData(arcoAncestor, options);

  // TDesign
  if (hasClass('t-table')) return extractTDesignTableData(target, options);
  const tdesignAncestor = closest('.t-table');
  if (tdesignAncestor) return extractTDesignTableData(tdesignAncestor, options);

  // 原生 table 或其子节点
  if (target.tagName && target.tagName.toLowerCase() === 'table') {
    return extractTableData(target, options);
  }
  const foundTable = target.querySelector && target.querySelector('table');
  if (foundTable) return extractTableData(foundTable, options);

  // 兜底：返回空结构
  return { data: [], merges: [], links: [] };
}

// 拼接多个提取结果（水平按列拼接）
function concatExtracts(extracts) {
  const parts = extracts.filter(Boolean);
  if (parts.length === 0) return { data: [], merges: [], links: [] };

  const colOffsets = [];
  const maxColsPerPart = [];
  let offset = 0;
  parts.forEach(p => {
    const maxCols = Math.max(0, ...p.data.map(r => r.length));
    maxColsPerPart.push(maxCols);
    colOffsets.push(offset);
    offset += maxCols;
  });

  const maxRows = Math.max(...parts.map(p => p.data.length));
  const data = [];
  for (let r = 0; r < maxRows; r++) {
    let row = [];
    parts.forEach((p, idx) => {
      const seg = (p.data[r] || []).slice();
      // 对齐到该部分最大列数，填充空字符串
      while (seg.length < maxColsPerPart[idx]) seg.push('');
      row = row.concat(seg);
    });
    data.push(row);
  }

  const merges = [];
  const links = [];
  parts.forEach((p, idx) => {
    const cOff = colOffsets[idx];
    p.merges.forEach(m => merges.push({ s: { r: m.s.r, c: m.s.c + cOff }, e: { r: m.e.r, c: m.e.c + cOff } }));
    p.links.forEach(l => links.push({ r: l.r, c: l.c + cOff, href: l.href, tooltip: l.tooltip }));
  });

  return { data, merges, links };
}

// 提取 Ant Design ant-table 数据：合并固定头部与主体及左右固定列
function extractAntTableData(container, options = {}) {
  const root = container.querySelector('.ant-table-container') || container;

  // 头部各区域
  const headerMain = root.querySelector('.ant-table-header table') || root.querySelector('.ant-table-content .ant-table-header table');
  const headerLeft = root.querySelector('.ant-table-fixed-left .ant-table-header table');
  const headerRight = root.querySelector('.ant-table-fixed-right .ant-table-header table');

  const headerExtracts = [headerLeft, headerMain, headerRight]
    .map(t => t ? extractTableData(t, { ...options, onlyVisibleColumns: options.onlyVisibleColumns !== false }) : null);
  const headerCombined = concatExtracts(headerExtracts);

  // 主体各区域
  const bodyMain = root.querySelector('.ant-table-body table') || root.querySelector('.ant-table-content .ant-table-body table');
  const bodyLeft = root.querySelector('.ant-table-fixed-left .ant-table-body table');
  const bodyRight = root.querySelector('.ant-table-fixed-right .ant-table-body table');
  const bodyExtracts = [bodyLeft, bodyMain, bodyRight]
    .map(t => t ? extractTableData(t, options) : null);
  const bodyCombined = concatExtracts(bodyExtracts);

  // 垂直拼接头部与主体
  const data = [...headerCombined.data, ...bodyCombined.data];
  const rowOffset = headerCombined.data.length;
  const merges = [
    ...headerCombined.merges,
    ...bodyCombined.merges.map(m => ({ s: { r: m.s.r + rowOffset, c: m.s.c }, e: { r: m.e.r + rowOffset, c: m.e.c } }))
  ];
  const links = [
    ...headerCombined.links,
    ...bodyCombined.links.map(l => ({ r: l.r + rowOffset, c: l.c, href: l.href, tooltip: l.tooltip }))
  ];

  return { data, merges, links };
}

// 提取 Naive UI n-data-table 数据：合并表头和主体
function extractNaiveTableData(container, options = {}) {
  const headerTable =
    container.querySelector('.n-data-table-base-table-header table') ||
    (container.querySelector('.n-data-table thead') ? container.querySelector('.n-data-table thead').closest('table') : null) ||
    Array.from(container.querySelectorAll('table')).find(t => t.querySelector('thead')) || null;

  let bodyTable = container.querySelector('.n-data-table-base-table-body table') || container.querySelector('.n-data-table-body table') || null;
  if (!bodyTable) {
    bodyTable = Array.from(container.querySelectorAll('table')).find(t => t !== headerTable && t.querySelector('tbody')) || null;
  }

  const header = headerTable ? extractTableData(headerTable, { ...options, onlyVisibleColumns: options.onlyVisibleColumns !== false }) : { data: [], merges: [], links: [] };
  const body = bodyTable ? extractTableData(bodyTable, options) : { data: [], merges: [], links: [] };

  return {
    data: [...header.data, ...body.data],
    merges: [...(header.merges || []), ...(body.merges || [])],
    links: [...(header.links || []), ...(body.links || [])]
  };
}

// 通用：根据选择器片段拼接（左/中/右 × 头/体）
function extractBySegments(container, segments, options = {}) {
  const pick = (sel) => sel ? container.querySelector(sel) : null;
  const headerTables = [pick(segments.header.left), pick(segments.header.main), pick(segments.header.right)];
  const bodyTables = [pick(segments.body.left), pick(segments.body.main), pick(segments.body.right)];
  const headerExtracts = headerTables.map(t => t ? extractTableData(t, { ...options, onlyVisibleColumns: options.onlyVisibleColumns !== false }) : null);
  const bodyExtracts = bodyTables.map(t => t ? extractTableData(t, options) : null);
  const headerCombined = concatExtracts(headerExtracts);
  const bodyCombined = concatExtracts(bodyExtracts);
  const data = [...headerCombined.data, ...bodyCombined.data];
  const rowOffset = headerCombined.data.length;
  const merges = [
    ...headerCombined.merges,
    ...bodyCombined.merges.map(m => ({ s: { r: m.s.r + rowOffset, c: m.s.c }, e: { r: m.e.r + rowOffset, c: m.e.c } }))
  ];
  const links = [
    ...headerCombined.links,
    ...bodyCombined.links.map(l => ({ r: l.r + rowOffset, c: l.c, href: l.href, tooltip: l.tooltip }))
  ];
  return { data, merges, links };
}

// View UI / iView / View UI Plus
function extractIvuTableData(container, options = {}) {
  return extractBySegments(container, {
    header: {
      left: '.ivu-table-fixed-left .ivu-table-header table',
      main: '.ivu-table-header table',
      right: '.ivu-table-fixed-right .ivu-table-header table',
    },
    body: {
      left: '.ivu-table-fixed-left .ivu-table-body table',
      main: '.ivu-table-body table',
      right: '.ivu-table-fixed-right .ivu-table-body table',
    }
  }, options);
}

// Arco Design
function extractArcoTableData(container, options = {}) {
  const root = container.querySelector('.arco-table-container') || container;
  return extractBySegments(root, {
    header: {
      left: '.arco-table-fixed-left .arco-table-header table',
      main: '.arco-table-header table',
      right: '.arco-table-fixed-right .arco-table-header table',
    },
    body: {
      left: '.arco-table-fixed-left .arco-table-body table',
      main: '.arco-table-body table',
      right: '.arco-table-fixed-right .arco-table-body table',
    }
  }, options);
}

// TDesign（腾讯）
function extractTDesignTableData(container, options = {}) {
  const root = container.querySelector('.t-table__content') || container;
  return extractBySegments(root, {
    header: {
      left: '.t-table__fixed-left .t-table__header table',
      main: '.t-table__header table',
      right: '.t-table__fixed-right .t-table__header table',
    },
    body: {
      left: '.t-table__fixed-left .t-table__body table',
      main: '.t-table__body table',
      right: '.t-table__fixed-right .t-table__body table',
    }
  }, options);
}

// 轻量设置面板：用于选择导出选项
function showSettingsPanel(target, button) {
  let panel = target._downloadPanel;
  if (!panel) {
    panel = createSettingsPanel(target);
    target._downloadPanel = panel;
    target.appendChild(panel);
  }

  // 默认值
  const sheetNameInput = panel.querySelector('input[name="sheetName"]');
  sheetNameInput.value = getSheetName(target);
  panel.style.display = 'block';
}

function createSettingsPanel(target) {
  const panel = document.createElement('div');
  panel.className = 'table-download-panel';
  panel.style.cssText = `
    position: fixed;
    top: 30vh;
    left: calc(50% - 110px);
    z-index: 10000;
    background: #fff;
    border: 1px solid #ddd;
    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 12px;
    color: #333;
    min-width: 220px;
    display: none;
  `;

  panel.innerHTML = `
    <div style="margin-bottom:8px; font-weight:600;">${t('panel_title','导出设置')}</div>
    <div style="margin-bottom:8px;">
      ${t('file_type_label','文件类型：')}
      <label style="margin-right:8px;"><input type="radio" name="fileType" value="xlsx" checked> xlsx</label>
      <label><input type="radio" name="fileType" value="csv"> csv</label>
    </div>
    <div style="margin-bottom:8px;">
      ${t('sheet_name_label','工作表名：')}
      <input type="text" name="sheetName" placeholder="${t('sheet_name_placeholder','表格数据')}" style="width:100%;padding:4px;border:1px solid #ccc;border-radius:4px;">
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;margin-bottom:6px;"><input type="checkbox" name="onlyVisible" checked> ${t('only_visible_columns_label','仅导出可见列')}</label>
      <label style="display:block;"><input type="checkbox" name="preserveLinks" checked> ${t('preserve_links_label','保留超链接')}</label>
    </div>
    <div style="text-align:right;">
      <div data-action="cancel" style="display:inline-block;margin-right:8px;padding:4px 8px;border:1px solid #ccc;background:#f7f7f7;border-radius:4px;cursor:pointer;">${t('cancel','取消')}</div>
      <div data-action="confirm" style="display:inline-block;padding:4px 8px;border:1px solid rgba(65, 117, 5,1);background:rgba(65, 117, 5,1);color:#fff;border-radius:4px;cursor:pointer;">${t('export','导出')}</div>
    </div>
  `;

  // 交互：阻止冒泡，ESC关闭，外部点击关闭
  panel.addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') panel.style.display = 'none';
  });
  document.addEventListener('click', (ev) => {
    if (panel.style.display === 'block') panel.style.display = 'none';
  });

  // 确认/取消
  panel.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    panel.style.display = 'none';
  });
  panel.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    const fileType = panel.querySelector('input[name="fileType"]:checked').value;
    const rawName = panel.querySelector('input[name="sheetName"]').value;
    const sheetName = sanitizeExportName(rawName || getSheetName(target));
    const onlyVisibleColumns = panel.querySelector('input[name="onlyVisible"]').checked;
    const preserveHyperlinks = panel.querySelector('input[name="preserveLinks"]').checked;

    const options = {
      onlyVisibleColumns,
      preserveHyperlinks,
      sheetName,
      exportCSV: fileType === 'csv'
    };
    const structured = extractStructured(target, options);
    const ext = options.exportCSV ? 'csv' : 'xlsx';
    const filename = `${sheetName}.${ext}`;
    downloadTable(structured, filename, options);
    panel.style.display = 'none';
  });

  return panel;
}

// 名称清洗：用于工作表名与文件名保持一致（限制31字符，移除非法字符）
function sanitizeExportName(raw) {
  const cleaned = cleanText(raw)
    // 移除 Excel 工作表名非法字符，同时规避常见文件名非法字符
    .replace(/[\\\/:\*\?\[\]\|"<>]/g, '')
    .trim();
  // Excel工作表名最多31字符，文件名也使用该限制以保持一致
  return cleaned.slice(0, 31) || t('default_sheet_name','表格数据');
}

// 页面加载完成后初始化
window.addEventListener('load', initTableDetector);