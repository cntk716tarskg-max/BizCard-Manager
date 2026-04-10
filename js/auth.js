/**
 * auth.js
 * Firebase Authentication（Google ログイン）を管理する。
 * storage.js より前に読み込まれる必要がある。
 */

const AuthService = {
  _currentUser: null,

  /**
   * 現在ログイン中のユーザーを返す（未ログイン時は null）
   * @returns {firebase.User|null}
   */
  getUser() {
    return this._currentUser;
  },

  /**
   * 現在ログイン中のユーザー UID を返す（未ログイン時は null）
   * @returns {string|null}
   */
  getUid() {
    return this._currentUser ? this._currentUser.uid : null;
  },

  /**
   * Google アカウントでサインインする
   * ポップアップを試みて失敗した場合はリダイレクトにフォールバック
   */
  async signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await firebase.auth().signInWithPopup(provider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        // ポップアップがブロックされた場合はリダイレクト方式にフォールバック
        if (e.code === 'auth/popup-blocked') {
          await firebase.auth().signInWithRedirect(provider);
        }
        // ユーザーが自分でポップアップを閉じた場合は何もしない
      } else {
        throw e;
      }
    }
  },

  /**
   * サインアウトする。キャッシュも同時にクリアする。
   */
  async signOut() {
    const uid = this.getUid();
    await firebase.auth().signOut();
    if (uid) CacheService.clear(uid); // サインアウト後に他ユーザーのデータが見えないようにする
  },

  /**
   * 認証状態の変化を監視する
   * @param {function} callback - user を引数に取るコールバック
   * @returns {function} 監視を解除する関数（unsubscribe）
   */
  onAuthStateChanged(callback) {
    return firebase.auth().onAuthStateChanged(user => {
      this._currentUser = user;
      callback(user);
    });
  },
};
