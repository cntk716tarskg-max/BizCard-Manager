/**
 * ui.js
 * DOM描画・UI更新を担当する
 */

const UI = {
  /**
   * カードリスト全体を再描画する（グループ/フラット自動切替）
   * @param {object[]} cards
   */
  renderList(cards) {
    const listEl = document.getElementById('card-list');
    const emptyEl = document.getElementById('empty-state');

    if (!cards || cards.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    if (FilterService.isGroupedMode()) {
      const groups = FilterService.groupByCompany(cards);
      this._renderGroupedList(listEl, groups);
    } else {
      this._renderFlatList(listEl, cards);
    }

    // カードクリック → 詳細モーダル
    listEl.querySelectorAll('.card-item').forEach(el => {
      el.addEventListener('click', () => {
        DetailModal.open(el.dataset.id);
      });
    });

    // ★ボタン → お気に入りトグル（バブリングを止める）
    listEl.querySelectorAll('.card-star').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        CardService.toggleFavorite(btn.dataset.id);
      });
    });
  },

  /**
   * フラットなカードリストを描画する
   * @param {HTMLElement} listEl
   * @param {object[]} cards
   */
  _renderFlatList(listEl, cards) {
    listEl.innerHTML = cards.map(c => this.renderItem(c)).join('');
  },

  /**
   * 会社名グループ別にセクションヘッダー付きで描画する
   * @param {HTMLElement} listEl
   * @param {{ company: string, cards: object[] }[]} groups
   */
  _renderGroupedList(listEl, groups) {
    listEl.innerHTML = groups.map((group, idx) => `
      <div class="section-header${idx === 0 ? ' section-header--first' : ''}">
        <span class="section-company-name">${this._esc(group.company)}</span>
        <span class="section-count-badge">${group.cards.length}件</span>
      </div>
      <div class="section-cards">
        ${group.cards.map(c => this.renderItem(c)).join('')}
      </div>`).join('');
  },

  /**
   * カード1件分のHTML文字列を返す
   * @param {object} card
   * @returns {string}
   */
  renderItem(card) {
    const avatar = card.photos && card.photos.length > 0
      ? `<img src="${card.photos[0]}" alt="${this._esc(card.name)}">`
      : `<span>${this._initial(card.name)}</span>`;

    const companyParts = [];
    if (card.company) companyParts.push(`<span class="card-company">${this._esc(card.company)}</span>`);
    if (card.position) {
      if (companyParts.length) companyParts.push('<span class="card-company-sep"></span>');
      companyParts.push(`<span>${this._esc(card.position)}</span>`);
    }

    const tags = (card.tags || []).slice(0, 4)
      .map(t => `<span class="tag-chip">${this._esc(t)}</span>`)
      .join('');

    const starClass = card.isFavorite ? 'card-star active' : 'card-star';
    const starFill = card.isFavorite ? 'currentColor' : 'none';

    const date = this._formatDate(card.updatedAt);

    return `
      <div class="card-item" data-id="${card.id}" tabindex="0" role="button" aria-label="${this._esc(card.name)}">
        <div class="card-avatar">${avatar}</div>
        <div class="card-info">
          <div class="card-name-row">
            <span class="card-name">${this._esc(card.name)}</span>
            ${card.kana ? `<span class="card-kana">${this._esc(card.kana)}</span>` : ''}
          </div>
          ${companyParts.length ? `<div class="card-company-row">${companyParts.join('')}</div>` : ''}
          ${tags ? `<div class="card-tags">${tags}</div>` : ''}
        </div>
        <div class="card-right">
          <span class="card-date">${date}</span>
          <button class="${starClass}" data-id="${card.id}" title="お気に入り" aria-label="お気に入り">
            <svg viewBox="0 0 24 24" fill="${starFill}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
        </div>
      </div>`;
  },

  /**
   * 統計バーを更新する
   * @param {object[]} allCards
   * @param {object[]} filteredCards
   */
  renderStatsBar(allCards, filteredCards) {
    const total = (allCards || []).length;
    const favCount = (allCards || []).filter(c => c.isFavorite).length;
    const filteredCount = (filteredCards || []).length;

    document.getElementById('stats-total').textContent = `全${total}件`;
    document.getElementById('stats-favorite').innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:13px;height:13px;color:var(--accent)">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>お気に入り${favCount}件`;

    const filteredEl = document.getElementById('stats-filtered');
    if (filteredCount < total) {
      filteredEl.textContent = `表示中: ${filteredCount}件`;
      filteredEl.classList.remove('hidden');
    } else {
      filteredEl.classList.add('hidden');
    }
  },

  /**
   * タグフィルターボタンを描画する
   * @param {object[]} allCards
   */
  renderTagFilters(allCards) {
    const container = document.getElementById('tag-filters');
    const tags = FilterService.getAllTags(allCards || []);

    if (tags.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = tags.map(tag => {
      const isActive = State.activeTagFilters.includes(tag);
      return `<button class="tag-filter-btn${isActive ? ' active' : ''}" data-tag="${this._esc(tag)}">${this._esc(tag)}</button>`;
    }).join('');

    container.querySelectorAll('.tag-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        const idx = State.activeTagFilters.indexOf(tag);
        if (idx === -1) {
          State.activeTagFilters.push(tag);
        } else {
          State.activeTagFilters.splice(idx, 1);
        }
        CardService.applyFilter();
      });
    });
  },

  /**
   * エンプティステートを表示する
   */
  showEmpty() {
    document.getElementById('card-list').innerHTML = '';
    document.getElementById('empty-state').classList.remove('hidden');
  },

  // ---- ローディング制御 ----

  /**
   * ページ全体のローディングオーバーレイを表示／非表示にする
   * @param {boolean} isLoading
   */
  setPageLoading(isLoading) {
    const el = document.getElementById('page-loading');
    if (!el) return;
    el.classList.toggle('hidden', !isLoading);
  },

  /**
   * ボタンをローディング状態にする／解除する
   * @param {HTMLButtonElement} btn
   * @param {boolean} isLoading
   * @param {string} loadingText - ローディング中に表示するテキスト
   */
  setButtonLoading(btn, isLoading, loadingText = '処理中...') {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.innerHTML = `<span class="btn-spinner"></span>${loadingText}`;
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || loadingText;
      delete btn.dataset.originalText;
    }
  },

  /**
   * ログイン画面を表示し、アプリ本体を隠す
   */
  showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-wrapper').classList.add('hidden');
    this.setPageLoading(false);
  },

  /**
   * アプリ本体を表示し、ログイン画面を隠す
   * ヘッダーのアバター画像・ユーザー名も更新する
   * @param {firebase.User} user
   */
  showApp(user) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');

    // アバター画像
    const avatar = document.getElementById('user-avatar');
    if (avatar) {
      if (user.photoURL) {
        avatar.src = user.photoURL;
        avatar.alt = user.displayName || 'ユーザー';
        avatar.classList.remove('hidden');
      } else {
        avatar.classList.add('hidden');
      }
    }

    // ユーザー名（存在する場合のみ）
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = user.displayName || user.email || '';
  },

  /**
   * ネットワークエラーをカードリスト領域に表示する
   * @param {string} message
   */
  showNetworkError(message) {
    const listEl = document.getElementById('card-list');
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (listEl) {
      listEl.innerHTML = `
        <div class="network-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>${message}</p>
          <button class="btn btn-primary btn-sm" onclick="location.reload()">再読み込み</button>
        </div>`;
    }
  },

  // ---- ユーティリティ ----

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _initial(name) {
    if (!name) return '?';
    // ひらがな・カタカナ・漢字の最初の1文字
    return [...name.replace(/\s/g, '')][0] || '?';
  },

  _formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return '今日';
    if (diffDays === 1) return '昨日';
    if (diffDays < 7) return `${diffDays}日前`;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  },
};
