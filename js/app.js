/**
 * app.js
 * エントリーポイント。DOMContentLoaded後に初期化・イベントバインドを行う。
 * 認証状態に応じてログイン画面 ↔ アプリ本体を切り替える。
 */

document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------------------------
  // イベントバインド（一度だけ行う。認証状態に依存しない）
  // -----------------------------------------------

  // 名刺を追加ボタン
  document.getElementById('btn-add').addEventListener('click', () => {
    FormModal.open();
  });

  // エンプティステートの追加ボタン
  document.getElementById('btn-add-empty').addEventListener('click', () => {
    FormModal.open();
  });

  // CSV出力ボタン
  document.getElementById('btn-export').addEventListener('click', () => {
    ExportService.download();
  });

  // Googleログインボタン
  document.getElementById('btn-google-login').addEventListener('click', async () => {
    const btn = document.getElementById('btn-google-login');
    UI.setButtonLoading(btn, true, 'ログイン中...');
    try {
      await AuthService.signInWithGoogle();
      // onAuthStateChanged が発火して UI が切り替わる
    } catch (e) {
      console.error('ログインエラー:', e);
      alert('ログインに失敗しました。もう一度お試しください。');
      UI.setButtonLoading(btn, false, 'Googleでログイン');
    }
  });

  // ログアウトボタン
  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (!confirm('ログアウトしますか？')) return;
    await AuthService.signOut();
    // onAuthStateChanged が発火してログイン画面に戻る
  });

  // -----------------------------------------------
  // 検索
  // -----------------------------------------------
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    State.searchQuery = searchInput.value;
    searchClear.classList.toggle('hidden', !State.searchQuery);
    CardService.applyFilter();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    State.searchQuery = '';
    searchClear.classList.add('hidden');
    searchInput.focus();
    CardService.applyFilter();
  });

  // -----------------------------------------------
  // ソート
  // -----------------------------------------------
  document.getElementById('sort-select').addEventListener('change', e => {
    State.sortKey = e.target.value;
    CardService.applyFilter();
  });

  // -----------------------------------------------
  // お気に入りフィルター
  // -----------------------------------------------
  const favBtn = document.getElementById('btn-favorite-filter');
  favBtn.addEventListener('click', () => {
    State.showFavoriteOnly = !State.showFavoriteOnly;
    favBtn.classList.toggle('active', State.showFavoriteOnly);
    favBtn.title = State.showFavoriteOnly ? 'すべて表示' : 'お気に入りのみ表示';
    CardService.applyFilter();
  });

  // -----------------------------------------------
  // キーボードショートカット
  // -----------------------------------------------
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const formModal   = document.getElementById('form-modal');
      const detailModal = document.getElementById('detail-modal');
      if (!formModal.classList.contains('hidden')) {
        FormModal.close();
      } else if (!detailModal.classList.contains('hidden')) {
        DetailModal.close();
      }
    }
  });

  // -----------------------------------------------
  // 認証状態の監視（初回ロード含む）
  // -----------------------------------------------
  AuthService.onAuthStateChanged(async user => {
    if (user) {
      // ログイン済み → アプリ表示 → データ読み込み
      UI.showApp(user);
      UI.setPageLoading(true);
      try {
        await CardService.load();
      } catch (e) {
        console.error('データ読み込みエラー:', e);
      } finally {
        UI.setPageLoading(false);
      }
    } else {
      // 未ログイン → ログイン画面表示
      State.cards    = [];
      State.filtered = [];
      UI.showLoginScreen();
    }
  });
});
