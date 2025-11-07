# 表格下载器（浏览器扩展）

一个可以在网页中自动识别并为数据表格添加“下载到 Excel/CSV”按钮的扩展。支持多种主流前端 UI 框架的数据表格，并在导出时保持列顺序、合并单元格、超链接等信息。

## 功能特性

- 自动识别并处理数据表格容器，每个容器仅挂载一个下载按钮。
- 支持固定表头与左右固定列的拼接导出，列顺序与对齐保持一致。
- 自动保留合并单元格与超链接信息；支持仅导出可见列（可在设置面板中配置“仅导出可见列”“保留超链接”）。
- 支持导出为 `xlsx` 或 `csv`。
- 适配多种主流框架：Element Plus、Naive UI、Ant Design、View UI(iView)、Arco Design、TDesign。

## 安装（Chrome / Edge）

1. 打开浏览器扩展管理页：
   - Chrome：地址栏输入 `chrome://extensions/`
   - Edge：地址栏输入 `edge://extensions/`
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目目录 `table-download`。
4. 安装完成后，在含有表格的网页上会自动注入下载按钮。

> 清单（Manifest v3）已配置图标与入口，`content_scripts` 会在所有页面注入（`<all_urls>`），权限为 `activeTab`。

## 使用说明

- 打开含有数据表格的网页，等待按钮出现在表格或其容器的左上角（不同框架位置略有差异）。
- 点击“下载”按钮，弹出设置面板：
  - 文件类型：`xlsx` 或 `csv`
  - 工作表名/文件名（自动同步，非法字符自动清洗）
  - 是否仅导出可见列
  - 是否保留超链接
- 确认后自动导出 `.xlsx` 或 `.csv` 文件（基于 `xlsx.full.min.js`）。

## 文件结构

```
table-download/
├── content.js           # 页面逻辑：检测容器、挂载按钮、设置面板、数据提取
├── download.js          # Excel 生成与下载逻辑（基于 xlsx）
├── xlsx.full.min.js     # XLSX 库
├── manifest.json        # 扩展清单（MV3），含 icons 与 action
├── icon.png             # 扩展图标
└── README.md            # 项目文档
```

## 关键实现与扩展点

- DOM 观察与统一处理
  - 通过统一框架配置 `FRAMEWORK_CONFIG` 与 `processFrameworkTable(container, key)`，对各类表格容器做去重与按钮挂载。
  - 按钮创建统一为 `addFrameworkDownloadButton(wrapper)`，保持样式与交互一致。
- 统一提取路由
  - `extractStructured(target, options)` 会根据目标元素或最近祖先的类名，路由到具体提取器：
    - `extractAntTableData` / `extractElTableData` / `extractNaiveTableData`
    - `extractIvuTableData`（View UI）、`extractArcoTableData`、`extractTDesignTableData`
  - 通用段式拼接 `extractBySegments(container, segments, options)` 负责左/中/右 × 头/体 6 段的合并。
- 列对齐与合并
  - 使用增强版 `concatExtracts`：横向拼接时按“每段最大列数”填充，避免列错位，并正确偏移合并与超链接坐标。
- 导出能力
  - `downloadTable(structured, filename, options)` 同时支持 `xlsx` 与 `csv` 导出，应用合并范围与超链接。
  - 工作表名与文件名会自动清洗非法字符，长度限制为 31 字符。

## 支持的框架与容器类名

- Element Plus：`.el-table`
- Naive UI：`.n-data-table`
- Ant Design：`.ant-table`（内部优先 `.ant-table-container`）
- View UI / iView：`.ivu-table`
- Arco Design：`.arco-table`（内部优先 `.arco-table-container`）
- TDesign（腾讯）：`.t-table`（内部优先 `.t-table__content`）

> 如果你的页面结构与上述类名不同，欢迎提供 DOM 片段，我会快速调整选择器与拼接逻辑。

## 开发与构建

- 开发建议：
  - 新增框架支持时，优先通过 `FRAMEWORK_CONFIG` 定义容器与挂载 `wrapper`，并为其实现一个基于 `extractBySegments` 的提取器函数。
  - 在 `extractStructured` 中加入该框架的类名路由即可完成接入。
  - 保持按钮挂载与去重逻辑不变，避免重复插入。
- 兼容性与限制：
  - 虚拟滚动或懒加载表格（仅渲染可见行）默认按“可见 DOM”导出。
  - 需要“数据源模式”导出未渲染数据时，可按框架提供的 API/props 实现专用提取（可在此项目中扩展）。
- 可选混淆（用于分发）：
  - 需要本地安装 Node.js 与 `javascript-obfuscator`。
  - 示例：`npm i -g javascript-obfuscator`
  - 命令：`javascript-obfuscator content.js download.js --output dist ...`
  - 如更新为混淆文件，请同步修改 `manifest.json` 的 `content_scripts.js` 指向 `dist/` 目录。

## 常见问题

- 未出现下载按钮：
  - 检查容器类名是否符合预期；表格是否处于可见状态；是否存在自定义 `shadow DOM`。
- 导出列错位：
  - 检查是否存在自定义隐藏列/动态列；可尝试开启“仅导出可见列”。
- 性能与体量：
  - 超大表格导出会耗时较长；建议分批或采用数据源模式以提升性能。
- 权限说明：
  - 本扩展仅使用 `activeTab` 权限并注入 `content_scripts`，不采集用户数据。

## 图标

- `manifest.json` 已配置：
  - `icons`: `16/48/128` 指向 `icon.png`
  - `action.default_icon`: `icon.png`
  - `action.default_title`: “表格下载器”

## 计划与扩展

- 后续可增加：PrimeVue/PrimeReact、Quasar、Material UI 等表格支持。
- 提供“数据源模式”以支持虚拟滚动/未渲染数据的完整导出。
- 增强设置面板（列选择、筛选条件、导出格式 TSV）。

如需自定义你的页面或框架版本的适配，请提需求或提供页面结构，我会快速协助完善。
## 国际化（i18n）

- 默认语言：`zh_CN`；已内置多语言包：`ar`、`de`、`en`、`es`、`fr`、`hi`、`it`、`ja`、`ko`、`nl`、`pt_BR`、`ru`、`th`、`tr`、`vi`、`zh_CN`、`zh_TW`。
- 所有文案通过 `chrome.i18n.getMessage` 读取，扩展清单使用 `__MSG_...__` 键。