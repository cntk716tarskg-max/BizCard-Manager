/**
 * export.js
 * 現在の State.filtered を CSV ダウンロードする
 *
 * 出力列:
 *   氏名, ふりがな, 会社名, 部署, 役職, 郵便番号, 住所,
 *   電話番号1種別, 電話番号1, 電話番号2種別, 電話番号2,
 *   メール1, メール2, タグ, 備考, 登録日, 更新日
 *
 * 文字コード: UTF-8 BOM付き（Excel対応）
 */

const ExportService = {
  /**
   * State.filtered の内容を CSV としてダウンロードする
   */
  download() {
    const cards = State.filtered;
    if (!cards || cards.length === 0) {
      alert('エクスポートするデータがありません。');
      return;
    }

    const header = [
      '氏名', 'ふりがな', '会社名', '会社名ふりがな', '部署', '役職',
      '郵便番号', '住所',
      '電話番号1種別', '電話番号1', '電話番号2種別', '電話番号2',
      'メール1', 'メール2',
      'タグ', '備考', '登録日', '更新日',
    ];

    const rows = cards.map(c => {
      const phones = c.phones || [];
      const emails = c.emails || [];
      const fmt = iso => {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      };

      return [
        c.name        || '',
        c.kana        || '',
        c.company     || '',
        c.companyKana || '',
        c.department  || '',
        c.position   || '',
        c.zipCode    || '',
        c.address    || '',
        phones[0]?.type   || '',
        phones[0]?.number || '',
        phones[1]?.type   || '',
        phones[1]?.number || '',
        emails[0] || '',
        emails[1] || '',
        (c.tags || []).join('／'),
        c.notes      || '',
        fmt(c.createdAt),
        fmt(c.updatedAt),
      ];
    });

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => this._quoteCell(cell)).join(','))
      .join('\r\n');

    // UTF-8 BOM付き
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`;
    const filename = `名刺データ_${dateStr}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * CSV セルを適切にクォートする
   * @param {string} value
   * @returns {string}
   */
  _quoteCell(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },
};
