/**
 * detail.js
 * 名刺詳細モーダルを制御する
 *
 * レイアウト:
 *   PC  : 左カラム = 写真カルーセル（固定）、右カラム = 情報（スクロール）
 *   SP  : 縦積み  = 写真カルーセル（上）、情報（下、モーダル全体でスクロール）
 */

const DetailModal = {
  _currentId: null,
  _photoIdx: 0,

  /**
   * 詳細モーダルを開く
   * @param {string} id
   */
  open(id) {
    const card = CardService.getById(id);
    if (!card) return;

    this._currentId = id;
    this._photoIdx = 0;
    this._render(card);

    document.getElementById('detail-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  /**
   * 詳細モーダルを閉じる
   */
  close() {
    document.getElementById('detail-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._currentId = null;
  },

  /**
   * モーダル全体を描画する
   * @param {object} card
   */
  _render(card) {
    const body = document.getElementById('detail-modal-body');
    const photos = card.photos || [];

    body.innerHTML = `
      <div class="detail-layout">
        <div class="detail-photo-panel">
          ${this._buildPhotoPanel(photos)}
        </div>
        <div class="detail-info-panel">
          ${this._buildInfoPanel(card)}
        </div>
      </div>`;

    document.getElementById('detail-modal-title').textContent = card.name || '詳細';

    if (photos.length > 0) {
      this._initCarousel(photos);
    }
  },

  /**
   * 写真パネルのHTML文字列を返す
   * @param {string[]} photos
   * @returns {string}
   */
  _buildPhotoPanel(photos) {
    if (photos.length === 0) {
      return `
        <div class="detail-no-photo">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="10" width="40" height="28" rx="4"/>
            <circle cx="17" cy="22" r="4"/>
            <path d="M4 34l10-10 8 8 6-6 16 12" stroke-linejoin="round"/>
          </svg>
          <span>写真なし</span>
        </div>`;
    }

    const navButtons = photos.length > 1 ? `
      <button class="carousel-nav carousel-prev" aria-label="前の写真">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button class="carousel-nav carousel-next" aria-label="次の写真">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>` : '';

    const footer = photos.length > 1 ? `
      <div class="carousel-footer">
        <span class="carousel-counter">1 / ${photos.length}</span>
        <div class="carousel-dots">
          ${photos.map((_, i) => `
            <button class="carousel-dot${i === 0 ? ' active' : ''}"
                    data-idx="${i}" aria-label="写真${i + 1}"></button>`).join('')}
        </div>
      </div>` : '';

    return `
      <div class="detail-carousel">
        <a href="${photos[0]}" target="_blank" rel="noopener"
           class="detail-carousel-link" title="クリックで拡大表示">
          <img class="detail-carousel-img" src="${photos[0]}" alt="名刺写真1">
        </a>
        ${navButtons}
        ${footer}
      </div>`;
  },

  /**
   * 情報パネルのHTML文字列を返す
   * @param {object} card
   * @returns {string}
   */
  _buildInfoPanel(card) {
    const esc = s => UI._esc(s);
    const fmt = s => {
      if (!s) return '';
      const d = new Date(s);
      return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
    };

    let html = '';

    // 氏名ブロック
    html += `<div class="detail-name-block">
      <div class="detail-name">${esc(card.name)}</div>
      ${card.kana ? `<div class="detail-kana">${esc(card.kana)}</div>` : ''}
      ${card.company ? `<div class="detail-company">${esc(card.company)}</div>` : ''}`;
    const deptPos = [card.department, card.position].filter(Boolean).join('　');
    if (deptPos) html += `<div class="detail-dept-pos">${esc(deptPos)}</div>`;
    html += `</div>`;

    // 電話番号
    if (card.phones && card.phones.length > 0) {
      html += `<div class="detail-section">
        <div class="detail-section-label">電話番号</div>
        <ul class="detail-list">
          ${card.phones.map(p => `
            <li>
              <span class="phone-type-badge">${esc(p.type)}</span>
              <a href="tel:${esc(p.number)}">${esc(p.number)}</a>
            </li>`).join('')}
        </ul>
      </div>`;
    }

    // メールアドレス
    if (card.emails && card.emails.length > 0) {
      html += `<div class="detail-section">
        <div class="detail-section-label">メールアドレス</div>
        <ul class="detail-list">
          ${card.emails.map(e => `<li><a href="mailto:${esc(e)}">${esc(e)}</a></li>`).join('')}
        </ul>
      </div>`;
    }

    // 住所
    if (card.address || card.zipCode) {
      const fullAddress = [card.zipCode ? `〒${card.zipCode}` : '', card.address]
        .filter(Boolean).join('　');
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address || '')}`;
      html += `<div class="detail-section">
        <div class="detail-section-label">住所</div>
        <div class="detail-address-row">
          <div class="detail-value">${esc(fullAddress)}</div>
          ${card.address ? `
            <button class="btn-map" onclick="window.open('${mapUrl}', '_blank')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              地図を開く
            </button>` : ''}
        </div>
      </div>`;
    }

    // タグ
    if (card.tags && card.tags.length > 0) {
      html += `<div class="detail-section">
        <div class="detail-section-label">タグ</div>
        <div class="detail-tags">
          ${card.tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('')}
        </div>
      </div>`;
    }

    // 備考
    if (card.notes) {
      html += `<div class="detail-section">
        <div class="detail-section-label">備考</div>
        <div class="detail-value" style="white-space:pre-wrap">${esc(card.notes)}</div>
      </div>`;
    }

    // 登録日・更新日
    html += `<div class="detail-meta">
      <span>登録日: ${fmt(card.createdAt)}</span>
      <span>更新日: ${fmt(card.updatedAt)}</span>
    </div>`;

    return html;
  },

  /**
   * カルーセルのイベントを初期化する（innerHTML設定後に呼ぶ）
   * @param {string[]} photos
   */
  _initCarousel(photos) {
    const carousel = document.querySelector('.detail-carousel');
    if (!carousel) return;

    carousel.querySelector('.carousel-prev')?.addEventListener('click', () => {
      this._showPhoto(photos, (this._photoIdx - 1 + photos.length) % photos.length);
    });

    carousel.querySelector('.carousel-next')?.addEventListener('click', () => {
      this._showPhoto(photos, (this._photoIdx + 1) % photos.length);
    });

    carousel.querySelectorAll('.carousel-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        this._showPhoto(photos, parseInt(dot.dataset.idx, 10));
      });
    });
  },

  /**
   * カルーセルを指定インデックスの写真に切り替える
   * @param {string[]} photos
   * @param {number} idx
   */
  _showPhoto(photos, idx) {
    this._photoIdx = idx;
    const carousel = document.querySelector('.detail-carousel');
    if (!carousel) return;

    const link = carousel.querySelector('.detail-carousel-link');
    const img  = carousel.querySelector('.detail-carousel-img');
    if (link) link.href = photos[idx];
    if (img)  { img.src = photos[idx]; img.alt = `名刺写真${idx + 1}`; }

    const counter = carousel.querySelector('.carousel-counter');
    if (counter) counter.textContent = `${idx + 1} / ${photos.length}`;

    carousel.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === idx);
    });
  },
};

// -----------------------------------------------
// 詳細モーダルのイベント設定（DOMContentLoaded後）
// -----------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('detail-modal-close').addEventListener('click', () => DetailModal.close());

  document.getElementById('detail-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) DetailModal.close();
  });

  document.getElementById('detail-edit-btn').addEventListener('click', () => {
    const card = CardService.getById(DetailModal._currentId);
    if (!card) return;
    DetailModal.close();
    FormModal.open(card);
  });

  document.getElementById('detail-delete-btn').addEventListener('click', async () => {
    if (!DetailModal._currentId) return;
    const card = CardService.getById(DetailModal._currentId);
    const name = card ? card.name : 'この名刺';

    if (!confirm(`「${name}」を削除しますか？\nこの操作は取り消せません。`)) return;

    const btn = document.getElementById('detail-delete-btn');
    UI.setButtonLoading(btn, true, '削除中...');

    try {
      await CardService.delete(DetailModal._currentId);
      DetailModal.close();
    } catch (e) {
      console.error('削除エラー:', e);
      alert('削除に失敗しました。ネットワーク接続を確認してください。');
      UI.setButtonLoading(btn, false, '削除');
    }
  });
});
