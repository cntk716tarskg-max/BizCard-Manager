/**
 * storage.js
 * Firebase Firestore / Storage 操作を集約する抽象レイヤー。
 * バックエンドを変更する際はこのファイルのみ修正する。
 *
 * 使用SDK: Firebase Compat v10（CDN / ビルドツール不要）
 */

// -----------------------------------------------
// Firebase 初期化
// -----------------------------------------------
const firebaseConfig = {
  apiKey:            'AIzaSyD26ZMXRL9st6Cn-hskfmhG_8xdAThAZOA',
  authDomain:        'bizcard-manager-95644.firebaseapp.com',
  projectId:         'bizcard-manager-95644',
  storageBucket:     'bizcard-manager-95644.firebasestorage.app',
  messagingSenderId: '305376546340',
  appId:             '1:305376546340:web:6076f05922e532f14912b1',
};

firebase.initializeApp(firebaseConfig);

/** Firestore インスタンス */
const db = firebase.firestore();

/** Firebase Storage インスタンス */
const fbStorage = firebase.storage();

// -----------------------------------------------
// StorageService — Firestore CRUD
// -----------------------------------------------
const StorageService = {
  /**
   * ログイン中ユーザーの cards サブコレクション参照を返す
   * @returns {firebase.firestore.CollectionReference}
   */
  _col() {
    const uid = AuthService.getUid();
    if (!uid) throw new Error('ログインしていません');
    return db.collection('users').doc(uid).collection('cards');
  },

  /**
   * バージョン管理ドキュメントの参照を返す
   * @returns {firebase.firestore.DocumentReference}
   */
  _versionRef() {
    const uid = AuthService.getUid();
    if (!uid) throw new Error('ログインしていません');
    return db.collection('users').doc(uid).collection('meta').doc('version');
  },

  /**
   * Firestore からバージョン文字列を取得する（1 回の読み取り）。
   * 取得失敗時は null を返す（キャッシュを使わず全件取得にフォールバック）。
   * @returns {Promise<string|null>}
   */
  async getVersion() {
    try {
      const doc = await this._versionRef().get();
      return doc.exists ? (doc.data().v || null) : null;
    } catch (e) {
      console.warn('バージョン取得失敗（全件取得にフォールバック）:', e);
      return null;
    }
  },

  /**
   * バージョンドキュメントを現在時刻で更新し、新しいバージョン文字列を返す。
   * 書き込み操作（add / update / delete）の直後に呼ぶ。
   * @returns {Promise<string>}
   */
  async updateVersion() {
    const v = Date.now().toString();
    await this._versionRef().set({ v });
    return v;
  },

  /**
   * 全件取得（更新日降順）
   * @returns {Promise<BusinessCard[]>}
   */
  async getAll() {
    const snap = await this._col().orderBy('updatedAt', 'desc').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  /**
   * 1件取得（詳細モーダルで最新データを取得するために使用）
   * @param {string} id
   * @returns {Promise<BusinessCard|null>}
   */
  async getCard(id) {
    const doc = await this._col().doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  /**
   * 1件保存（新規・更新 共通の upsert）
   * @param {BusinessCard} card
   */
  async saveCard(card) {
    const { id, ...data } = card;
    await this._col().doc(id).set(data);
  },

  /**
   * 1件削除
   * @param {string} id
   */
  async deleteCard(id) {
    await this._col().doc(id).delete();
  },
};

// -----------------------------------------------
// PhotoService — Firebase Storage 写真操作
// -----------------------------------------------
const PhotoService = {
  /**
   * photos 配列を処理する
   * - base64（data:...）は Storage にアップロードして URL に変換
   * - 既存 URL（https://...）はそのまま保持
   * @param {string[]} photos - base64 または Storage URL の配列
   * @param {string} cardId
   * @returns {Promise<string[]>} Storage URL のみの配列
   */
  async processPhotos(photos, cardId) {
    const urls = [];
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      if (photo.startsWith('data:')) {
        const fileName = `photo_${Date.now()}_${i}.jpg`;
        const url = await this._upload(photo, cardId, fileName);
        urls.push(url);
      } else if (photo.startsWith('https://')) {
        urls.push(photo); // 既存 URL はそのまま
      }
    }
    return urls;
  },

  /**
   * base64 → Blob → Storage にアップロードしてダウンロード URL を返す
   * @param {string} base64
   * @param {string} cardId
   * @param {string} fileName
   * @returns {Promise<string>}
   */
  async _upload(base64, cardId, fileName) {
    const uid  = AuthService.getUid();
    if (!uid) throw new Error('ログインしていません');
    const res  = await fetch(base64);
    const blob = await res.blob();
    const ref  = fbStorage.ref(`users/${uid}/cards/${cardId}/${fileName}`);
    await ref.put(blob, { contentType: 'image/jpeg' });
    return ref.getDownloadURL();
  },

  /**
   * Storage URL から画像を削除する（エラーは握り潰す）
   * @param {string} url
   */
  async deleteByUrl(url) {
    try {
      const ref = fbStorage.refFromURL(url);
      await ref.delete();
    } catch (e) {
      if (e.code !== 'storage/object-not-found') {
        console.warn('Storage 削除エラー:', e);
      }
    }
  },
};
