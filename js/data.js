/**
 * data.js
 * アプリ全体の状態と CRUD 処理を管理する。
 *
 * 【バージョンキャッシュ戦略】
 *   load()          : バージョン照合 → 一致ならキャッシュ使用（読み取り 1回）
 *                     不一致 / 初回 → 全件取得（読み取り N+1回）してキャッシュ更新
 *   add/update/delete: Firestore 書き込み後 → バージョン更新 → キャッシュ更新
 *   toggleFavorite  : 楽観的に UI 更新 → Firestore 成功後にバージョン更新＆キャッシュ更新
 *                     失敗時は UI のみロールバック（キャッシュは汚れていないので変更不要）
 */

const State = {
  cards: [],
  filtered: [],
  searchQuery: '',
  sortKey: 'company_asc',
  activeTagFilters: [],
  showFavoriteOnly: false,
};

const CardService = {
  /**
   * 名刺一覧を読み込む。
   * ① Firestore のバージョンを 1回取得
   * ② キャッシュのバージョンと一致 → キャッシュから即時表示（Firestore の読み取りはここまで 1回）
   * ③ 不一致 / キャッシュなし → 全件取得してキャッシュをバージョン付きで更新
   */
  async load() {
    const uid = AuthService.getUid();

    const [serverVersion, cached] = await Promise.all([
      StorageService.getVersion(),
      Promise.resolve(CacheService.get(uid)),
    ]);

    // バージョン一致 → キャッシュ使用（追加の Firestore 読み取りなし）
    if (serverVersion && cached && cached.version === serverVersion) {
      State.cards = cached.cards;
      this.applyFilter();
      return;
    }

    // バージョン不一致 / キャッシュなし → Firestore から全件取得
    try {
      const data = await StorageService.getAll();
      State.cards = Array.isArray(data) ? data : [];

      // バージョンドキュメントがなければここで初回作成
      const version = serverVersion || await StorageService.updateVersion();
      CacheService.set(uid, State.cards, version);
    } catch (e) {
      console.error('データ読み込みエラー:', e);
      State.cards = [];
      UI.showNetworkError('データの読み込みに失敗しました。ページを再読み込みしてください。');
    }
    this.applyFilter();
  },

  /**
   * 名刺を追加する。Firestore 保存 → バージョン更新 → キャッシュ更新。
   * @param {object} cardData
   */
  async add(cardData) {
    const id  = crypto.randomUUID();
    const now = new Date().toISOString();
    const photoUrls = await PhotoService.processPhotos(cardData.photos || [], id);

    const card = {
      ...cardData,
      id,
      photos:    photoUrls,
      createdAt: now,
      updatedAt: now,
    };

    await StorageService.saveCard(card);
    State.cards.unshift(card);
    const v = await StorageService.updateVersion();
    CacheService.set(AuthService.getUid(), State.cards, v);
    this.applyFilter();
    return card;
  },

  /**
   * 既存の名刺を更新する。Firestore 保存 → バージョン更新 → キャッシュ更新。
   * @param {string} id
   * @param {object} cardData
   */
  async update(id, cardData) {
    const existing = State.cards.find(c => c.id === id);
    const now      = new Date().toISOString();

    const keptUrls    = (cardData.photos || []).filter(p => p.startsWith('https://'));
    const removedUrls = (existing?.photos || [])
      .filter(url => url.startsWith('https://') && !keptUrls.includes(url));
    for (const url of removedUrls) {
      await PhotoService.deleteByUrl(url);
    }

    const photoUrls = await PhotoService.processPhotos(cardData.photos || [], id);
    const card = {
      ...existing,
      ...cardData,
      id,
      photos:    photoUrls,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await StorageService.saveCard(card);
    const idx = State.cards.findIndex(c => c.id === id);
    if (idx !== -1) State.cards[idx] = card;
    const v = await StorageService.updateVersion();
    CacheService.set(AuthService.getUid(), State.cards, v);
    this.applyFilter();
    return card;
  },

  /**
   * 名刺を削除する（Storage の写真も削除）。Firestore 削除 → バージョン更新 → キャッシュ更新。
   * @param {string} id
   */
  async delete(id) {
    const card = State.cards.find(c => c.id === id);
    for (const url of (card?.photos || []).filter(u => u.startsWith('https://'))) {
      await PhotoService.deleteByUrl(url);
    }

    await StorageService.deleteCard(id);
    State.cards = State.cards.filter(c => c.id !== id);
    const v = await StorageService.updateVersion();
    CacheService.set(AuthService.getUid(), State.cards, v);
    this.applyFilter();
  },

  /**
   * お気に入りをトグルする（楽観的更新）。
   * UI を先に更新 → Firestore 成功後にバージョン更新＆キャッシュ更新。
   * 失敗時は UI をロールバック（キャッシュは成功時にしか更新しないため汚れない）。
   * @param {string} id
   */
  async toggleFavorite(id) {
    const card = State.cards.find(c => c.id === id);
    if (!card) return;

    // 楽観的更新（UI のみ先行。キャッシュは成功後に更新）
    card.isFavorite = !card.isFavorite;
    card.updatedAt  = new Date().toISOString();
    this.applyFilter();

    try {
      await StorageService.saveCard(card);
      const v = await StorageService.updateVersion();
      CacheService.set(AuthService.getUid(), State.cards, v);
    } catch (e) {
      // 失敗 → UI ロールバック（キャッシュは更新していないので整合性は保たれる）
      card.isFavorite = !card.isFavorite;
      this.applyFilter();
      console.error('お気に入り更新エラー:', e);
    }
    return card;
  },

  /**
   * State.filtered を更新して UI を再描画する（同期処理・Firestore 読み取りなし）。
   */
  applyFilter() {
    State.filtered = FilterService.apply(State.cards, {
      searchQuery:      State.searchQuery,
      sortKey:          State.sortKey,
      activeTagFilters: State.activeTagFilters,
      showFavoriteOnly: State.showFavoriteOnly,
    });
    UI.renderList(State.filtered);
    UI.renderStatsBar(State.cards, State.filtered);
    UI.renderTagFilters(State.cards);
  },

  /**
   * id から名刺オブジェクトを取得する（メモリから返すため Firestore 読み取りなし）。
   * @param {string} id
   * @returns {object|undefined}
   */
  getById(id) {
    return State.cards.find(c => c.id === id);
  },
};
