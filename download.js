// 新的导出函数：支持工作表命名、合并区域、超链接与CSV
function downloadTable(structured, filename, options = {}) {
  const { data, merges = [], links = [] } = structured || {};
  const { sheetName = (typeof t === 'function' ? t('default_sheet_name','表格数据') : '表格数据'), exportCSV = false } = options;

  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(data || []);

  // 应用合并区域
  if (Array.isArray(merges) && merges.length > 0) {
    ws['!merges'] = merges.map(m => ({
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: m.e.c }
    }));
  }

  // 应用超链接（仅顶点单元格）
  if (Array.isArray(links) && links.length > 0) {
    links.forEach(link => {
      const addr = XLSX.utils.encode_cell({ r: link.r, c: link.c });
      if (!ws[addr]) ws[addr] = { t: 's', v: data?.[link.r]?.[link.c] ?? '' };
      ws[addr].l = { Target: link.href, Tooltip: link.tooltip || undefined };
    });
  }

  if (exportCSV) {
    // 导出 CSV
    const csv = XLSX.utils.sheet_to_csv(ws);
    // 添加 UTF-8 BOM，确保 Excel 正确识别编码，避免非英文乱码
    const BOM = '\ufeff';
    const blob = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return;
  }

  // 导出为 Excel
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || (typeof t === 'function' ? t('default_sheet_name','表格数据') : '表格数据'));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, {
    bookType: 'xlsx',
    bookSST: false,
    type: 'blob'
  });
}

// 兼容旧接口：仅用于保留原有调用（不再使用）
function downloadExcel(tableData, filename) {
  const defaultName = (typeof t === 'function' ? t('default_sheet_name','表格数据') : '表格数据');
  return downloadTable({ data: tableData, merges: [], links: [] }, filename, { sheetName: defaultName, exportCSV: false });
}