/**
 * cache.js
 * Firestore の読み取り回数を削減するための localStorage キャッシュ管理。
 *
 * 【キャッシュ戦略】
 *   - Firestore の読み取りは「初めて開いたデバイス（キャッシュなし）」のみ発生する
 *   - 書き込み操作（add / update / delete / toggleFavorite）後は必ずキャッシュを更新する
 *     → 再訪問時も Firestore を読まずキャッシュから即時表示できる
 *   - キャッシュはユーザー UID ごとに独立して保存する（他ユーザーのデータが混在しない）
 *   - ログアウト時にキャッシュを削除する（別ユーザーのデータが残らないようにする）
 */

const CacheService = {
  /** localStorage キー（ユーザー UID 別） */
  _key(uid) {
    return `bizcard_v1_${uid}`;
  },

  /**
   * キャッシュからカード配列を取得する。
   * 存在しない・破損している場合は null を返す。
   * @param {string} uid
   * @returns {object[]|null}
   */
  get(uid) {
    try {
      const raw = localStorage.getItem(this._key(uid));
      if (!raw) return null;
      const { cards } = JSON.parse(raw);
      return Array.isArray(cards) ? cards : null;
    } catch {
      return null;
    }
  },

  /**
   * カード配列全体をキャッシュに書き込む。
   * add / update / delete / toggleFavorite の成功後に呼ぶことで
   * キャッシュを常に最新状態に保つ。
   * localStorage が満杯などでも例外を投げない。
   * @param {string} uid
   * @param {object[]} cards
   */
  set(uid, cards) {
    try {
      localStorage.setItem(this._key(uid), JSON.stringify({ cards }));
    } catch (e) {
      console.warn('キャッシュ保存エラー（無視）:', e);
    }
  },

  /**
   * キャッシュを完全に削除する。ログアウト時に呼ぶ。
   * @param {string} uid
   */
  clear(uid) {
    try {
      localStorage.removeItem(this._key(uid));
    } catch { /* ignore */ }
  },
};
