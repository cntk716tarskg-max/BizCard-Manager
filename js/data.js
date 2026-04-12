/**
 * data.js
 * アプリ全体の状態と CRUD 処理を管理する。
 * Firestore は非同期のため全 CRUD メソッドを async にしている。
 *
 * 【キャッシュ戦略】
 *   load()   : キャッシュが有効であれば Firestore を読まず即時返却
 *              キャッシュ期限切れ or 初回のみ Firestore から全件取得
 *   add()    : Firestore 保存成功後にキャッシュを更新
 *   update() : Firestore 保存成功後にキャッシュを更新
 *   delete() : Firestore 削除成功後にキャッシュを更新
 *   toggleFavorite() : 楽観的更新でキャッシュも即時変更 → 失敗時はロールバック
 */

const State = {
  cards: [],           // 全名刺データ（メモリキャッシュ）
  filtered: [],        // フィルタ・ソート後の表示データ
  searchQuery: '',
  sortKey: 'company_asc',
  activeTagFilters: [],
  showFavoriteOnly: false,
};

const CardService = {
  /**
   * 名刺一覧を読み込む。
   * 常に Firestore から全件取得する（デバイス間で常に最新データを表示するため）。
   * 書き込み操作後は State.cards をメモリ上で更新するため再読み込みは不要。
   */
  async load() {
    try {
      const data = await StorageService.getAll();
      State.cards = Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('データ読み込みエラー:', e);
      State.cards = [];
      UI.showNetworkError('データの読み込みに失敗しました。ページを再読み込みしてください。');
    }
    this.applyFilter();
  },

  /**
   * 名刺を追加する。
   * 写真（base64）を Storage にアップロードしてから Firestore に保存し、
   * 成功後にキャッシュを更新する。
   * @param {object} cardData
   */
  async add(cardData) {
    const id  = crypto.randomUUID();
    const now = new Date().toISOString();

    // 写真を Storage にアップロード → URL 配列に変換
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
    CacheService.set(AuthService.getUid(), State.cards); // キャッシュ更新
    this.applyFilter();
    return card;
  },

  /**
   * 既存の名刺を更新する。
   * - 削除された写真は Storage からも削除
   * - 新規追加された写真（base64）は Storage にアップロード
   * - 成功後にキャッシュを更新する
   * @param {string} id
   * @param {object} cardData
   */
  async update(id, cardData) {
    const existing = State.cards.find(c => c.id === id);
    const now      = new Date().toISOString();

    // フォームで残されている既存 URL
    const keptUrls   = (cardData.photos || []).filter(p => p.startsWith('https://'));
    // Firestore には存在するが今回のフォームから除外された URL → Storage から削除
    const removedUrls = (existing?.photos || [])
      .filter(url => url.startsWith('https://') && !keptUrls.includes(url));
    for (const url of removedUrls) {
      await PhotoService.deleteByUrl(url);
    }

    // base64 → Storage アップロード、既存 URL はスルー
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
    CacheService.set(AuthService.getUid(), State.cards); // キャッシュ更新
    this.applyFilter();
    return card;
  },

  /**
   * 名刺を削除する（Storage の写真も削除）。
   * 成功後にキャッシュを更新する。
   * @param {string} id
   */
  async delete(id) {
    const card = State.cards.find(c => c.id === id);

    // Storage 上の写真を全て削除
    for (const url of (card?.photos || []).filter(u => u.startsWith('https://'))) {
      await PhotoService.deleteByUrl(url);
    }

    await StorageService.deleteCard(id);
    State.cards = State.cards.filter(c => c.id !== id);
    CacheService.set(AuthService.getUid(), State.cards); // キャッシュ更新
    this.applyFilter();
  },

  /**
   * お気に入りをトグルする（楽観的更新）。
   * UI とキャッシュを先に更新してから Firestore に保存。
   * Firestore 保存失敗時はキャッシュも含めてロールバックする。
   * @param {string} id
   */
  async toggleFavorite(id) {
    const card = State.cards.find(c => c.id === id);
    if (!card) return;

    const uid = AuthService.getUid();

    // 楽観的更新（即座に UI とキャッシュに反映）
    card.isFavorite = !card.isFavorite;
    card.updatedAt  = new Date().toISOString();
    this.applyFilter();
    CacheService.set(uid, State.cards);

    try {
      await StorageService.saveCard(card);
    } catch (e) {
      // Firestore 保存失敗 → UI とキャッシュをロールバック
      card.isFavorite = !card.isFavorite;
      this.applyFilter();
      CacheService.set(uid, State.cards);
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
