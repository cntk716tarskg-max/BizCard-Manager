/**
 * filter.js
 * 検索・ソート・フィルタ処理
 */

const FilterService = {
  /**
   * フィルタ・ソートを適用して結果配列を返す
   * @param {object[]} cards - 全名刺データ
   * @param {object} opts
   * @returns {object[]}
   */
  apply(cards, opts) {
    const { searchQuery, sortKey, activeTagFilters, showFavoriteOnly } = opts;
    let result = [...cards];

    // お気に入りフィルタ
    if (showFavoriteOnly) {
      result = result.filter(c => c.isFavorite);
    }

    // タグフィルタ（AND条件：選択タグを全て含む）
    if (activeTagFilters.length > 0) {
      result = result.filter(c =>
        activeTagFilters.every(tag => (c.tags || []).includes(tag))
      );
    }

    // テキスト検索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(c => this._matchSearch(c, q));
    }

    // ソート
    result = this._sort(result, sortKey);

    return result;
  },

  /**
   * 名刺が検索クエリにマッチするか
   * 対象：氏名・ふりがな・会社名・部署・役職・メール・備考・タグ
   */
  _matchSearch(card, query) {
    // 住所（複数対応・旧データ形式の後方互換）
    const addressTexts = card.addresses && card.addresses.length > 0
      ? card.addresses.flatMap(a => [a.label, a.zipCode, a.address])
      : [card.address, card.zipCode];

    const targets = [
      card.name,
      card.kana,
      card.company,
      card.companyKana,
      card.department,
      card.position,
      card.notes,
      ...addressTexts,
      ...(card.emails || []),
      ...(card.phones || []).map(p => p.number),
      ...(card.tags || []),
    ];
    return targets.some(t => t && t.toLowerCase().includes(query));
  },

  /**
   * ソート
   * @param {object[]} cards
   * @param {string} key
   * @returns {object[]}
   */
  _sort(cards, key) {
    return [...cards].sort((a, b) => {
      switch (key) {
        case 'updated_desc':
          return new Date(b.updatedAt) - new Date(a.updatedAt);
        case 'updated_asc':
          return new Date(a.updatedAt) - new Date(b.updatedAt);
        case 'name_asc':
          return (a.kana || a.name || '').localeCompare(
            b.kana || b.name || '', 'ja'
          );
        case 'company_asc':
          return (a.companyKana || a.company || '').localeCompare(
            b.companyKana || b.company || '', 'ja'
          );
        default:
          return 0;
      }
    });
  },

  /**
   * 全名刺からユニークなタグ一覧を取得する
   * @param {object[]} cards
   * @returns {string[]}
   */
  getAllTags(cards) {
    const set = new Set();
    cards.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
  },

  /**
   * 現在のソートキーがグループ表示モードかどうか
   * @returns {boolean}
   */
  isGroupedMode() {
    return State.sortKey === 'company_asc';
  },

  /**
   * 名刺を会社名でグループ化する
   * - グループ自体は会社名の五十音順
   * - グループ内はふりがな→氏名の五十音順
   * - 会社名が空の場合は「（会社名なし）」にまとめる
   * @param {object[]} cards
   * @returns {{ company: string, cards: object[] }[]}
   */
  groupByCompany(cards) {
    const map = new Map();
    cards.forEach(card => {
      const key = card.company?.trim() || '（会社名なし）';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(card);
    });

    // グループ内を五十音順にソート
    map.forEach(group => {
      group.sort((a, b) =>
        (a.kana || a.name || '').localeCompare(b.kana || b.name || '', 'ja')
      );
    });

    // グループ自体をふりがな優先で五十音順にソート（「（会社名なし）」は末尾）
    // sortKey にはふりがなを使い、表示名は元の会社名をそのまま使う
    const companyKanaMap = new Map();
    cards.forEach(card => {
      const key = card.company?.trim() || '（会社名なし）';
      if (!companyKanaMap.has(key) && card.companyKana) {
        companyKanaMap.set(key, card.companyKana.trim());
      }
    });

    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === '（会社名なし）') return 1;
        if (b === '（会社名なし）') return -1;
        const sortA = companyKanaMap.get(a) || a;
        const sortB = companyKanaMap.get(b) || b;
        return sortA.localeCompare(sortB, 'ja');
      })
      .map(([company, cards]) => ({ company, cards }));
  },
};
