/**
 * cache.js
 * Firestore の読み取り回数を削減するための localStorage キャッシュ管理。
 *
 * 【バージョンキャッシュ戦略】
 *   起動時:
 *     1. Firestore の meta/version ドキュメントを 1回だけ読む
 *     2. キャッシュ内のバージョンと一致 → カードデータは読まずキャッシュから即時表示
 *     3. バージョン不一致 / キャッシュなし → 全件取得してキャッシュを更新
 *
 *   書き込み後:
 *     - Firestore にカード保存 → meta/version を更新 → キャッシュを新バージョンで更新
 *     - 他のデバイスは次回起動時にバージョン不一致を検知して自動的に再取得する
 */

const CacheService = {
  /** localStorage キー（ユーザー UID 別） */
  _key(uid) {
    return `bizcard_v2_${uid}`;
  },

  /**
   * キャッシュからデータを取得する。
   * 存在しない・破損している場合は null を返す。
   * @param {string} uid
   * @returns {{ cards: object[], version: string }|null}
   */
  get(uid) {
    try {
      const raw = localStorage.getItem(this._key(uid));
      if (!raw) return null;
      const { cards, version } = JSON.parse(raw);
      if (!Array.isArray(cards)) return null;
      return { cards, version: version || null };
    } catch {
      return null;
    }
  },

  /**
   * カード配列とバージョンをキャッシュに書き込む。
   * 書き込み操作成功後に呼ぶ。localStorage が満杯でも例外を投げない。
   * @param {string} uid
   * @param {object[]} cards
   * @param {string} version
   */
  set(uid, cards, version) {
    try {
      localStorage.setItem(this._key(uid), JSON.stringify({ cards, version }));
    } catch (e) {
      console.warn('キャッシュ保存エラー（無視）:', e);
    }
  },

  /**
   * キャッシュを削除する。ログアウト時に呼ぶ。
   * @param {string} uid
   */
  clear(uid) {
    try {
      localStorage.removeItem(this._key(uid));
    } catch { /* ignore */ }
  },
};
