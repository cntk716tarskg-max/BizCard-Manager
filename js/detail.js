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
  _lb: { photos: [], idx: 0, scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0, pinchStartDist: 0, pinchStartScale: 1 },

  /**
   * 詳細モーダルを開く。
   * まず State.cards の値で即時表示し、
   * バックグラウンドで Firestore から最新データを取得して再描画する。
   * @param {string} id
   */
  async open(id) {
    const cached = CardService.getById(id);
    if (!cached) return;

    this._currentId = id;
    this._photoIdx = 0;
    this._render(cached);

    document.getElementById('detail-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Firestore から最新データを取得して再描画（別デバイスでの更新を反映）
    try {
      const fresh = await StorageService.getCard(id);
      if (fresh && this._currentId === id) {
        // State.cards も更新しておく（編集ボタン押下時に最新データを使うため）
        const idx = State.cards.findIndex(c => c.id === id);
        if (idx !== -1) State.cards[idx] = fresh;
        this._render(fresh);
      }
    } catch (e) {
      console.warn('詳細データの更新取得に失敗:', e);
    }
  },

  /**
   * 詳細モーダルを閉じる
   */
  close() {
    this._closeLightbox();
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
        <div class="carousel-img-wrap loading">
          <div class="carousel-img-skeleton"></div>
          <a href="${photos[0]}" target="_blank" rel="noopener"
             class="detail-carousel-link" title="クリックで拡大表示">
            <img class="detail-carousel-img" src="${photos[0]}" alt="名刺写真1">
          </a>
        </div>
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
      ${card.company ? `<div class="detail-company">${esc(card.company)}${card.companyKana ? `<span class="detail-company-kana">${esc(card.companyKana)}</span>` : ''}</div>` : ''}`;
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

    // 住所（複数対応・旧データ形式の後方互換）
    const addresses = card.addresses && card.addresses.length > 0
      ? card.addresses
      : (card.address || card.zipCode)
        ? [{ label: '', zipCode: card.zipCode || '', address: card.address || '' }]
        : [];
    if (addresses.length > 0) {
      html += `<div class="detail-section">
        <div class="detail-section-label">住所</div>
        ${addresses.map(addr => {
          const fullAddress = [addr.zipCode ? `〒${addr.zipCode}` : '', addr.address]
            .filter(Boolean).join('　');
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.address || '')}`;
          return `<div class="detail-address-item">
            ${addr.label ? `<span class="address-label-badge">${esc(addr.label)}</span>` : ''}
            <div class="detail-address-row">
              <div class="detail-value">${esc(fullAddress)}</div>
              ${addr.address ? `
                <button class="btn-map" onclick="window.open('${mapUrl}', '_blank')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  地図を開く
                </button>` : ''}
            </div>
          </div>`;
        }).join('')}
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

    // 最初の画像のローディング状態を管理
    const wrap = carousel.querySelector('.carousel-img-wrap');
    const img  = carousel.querySelector('.detail-carousel-img');
    if (wrap && img) {
      const onLoad = () => wrap.classList.remove('loading');
      if (img.complete && img.naturalWidth > 0) {
        wrap.classList.remove('loading');
      } else {
        img.addEventListener('load',  onLoad, { once: true });
        img.addEventListener('error', onLoad, { once: true });
      }
    }

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

    // 写真タップで全画面表示
    const link = carousel.querySelector('.detail-carousel-link');
    link?.addEventListener('click', () => {
      this._openLightbox(photos, this._photoIdx);
    });

    // スワイプナビゲーション（モバイル）
    if (photos.length > 1) {
      let swipeStartX = 0;
      let swipeStartY = 0;
      carousel.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          swipeStartX = e.touches[0].clientX;
          swipeStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      carousel.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
          if (dx < 0) {
            this._showPhoto(photos, (this._photoIdx + 1) % photos.length);
          } else {
            this._showPhoto(photos, (this._photoIdx - 1 + photos.length) % photos.length);
          }
        }
      }, { passive: true });
    }
  },

  // ライトボックスを開く
  _openLightbox(photos, idx) {
    const lb = document.getElementById('photo-lightbox');
    if (!lb) return;
    Object.assign(this._lb, { photos, idx, scale: 1, tx: 0, ty: 0, dragging: false });
    this._lbUpdateImage();
    lb.classList.remove('hidden');
  },

  // ライトボックスを閉じる
  _closeLightbox() {
    const lb = document.getElementById('photo-lightbox');
    if (lb) lb.classList.add('hidden');
    this._lb.dragging = false;
  },

  // ライトボックスの画像・カウンターを更新
  _lbUpdateImage() {
    const lb = document.getElementById('photo-lightbox');
    if (!lb) return;
    const img = lb.querySelector('.lightbox-img');
    const counter = lb.querySelector('.lightbox-counter');
    if (img) {
      img.src = this._lb.photos[this._lb.idx];
      img.alt = `名刺写真 ${this._lb.idx + 1}`;
    }
    if (counter) {
      counter.textContent = this._lb.photos.length > 1
        ? `${this._lb.idx + 1} / ${this._lb.photos.length}` : '';
    }
    const navVisible = this._lb.photos.length > 1;
    lb.querySelector('.lightbox-prev').style.visibility = navVisible ? '' : 'hidden';
    lb.querySelector('.lightbox-next').style.visibility = navVisible ? '' : 'hidden';
    Object.assign(this._lb, { scale: 1, tx: 0, ty: 0 });
    this._lbApplyTransform();
  },

  // ライトボックスの transform を適用
  _lbApplyTransform(immediate = false) {
    const lb = document.getElementById('photo-lightbox');
    if (!lb) return;
    const img = lb.querySelector('.lightbox-img');
    if (img) {
      img.style.transition = immediate ? 'none' : 'transform 0.12s ease';
      img.style.transform = `translate(${this._lb.tx}px, ${this._lb.ty}px) scale(${this._lb.scale})`;
    }
    const stage = lb.querySelector('.lightbox-stage');
    if (stage) {
      stage.style.cursor = this._lb.dragging ? 'grabbing' : (this._lb.scale > 1 ? 'grab' : 'zoom-in');
    }
  },

  // カーソル位置に向かってズーム
  _lbZoom(factor, cursorX, cursorY) {
    const lb = document.getElementById('photo-lightbox');
    const stage = lb?.querySelector('.lightbox-stage');
    if (!stage) return;
    const newScale = Math.max(1, Math.min(5, this._lb.scale * factor));
    if (newScale === this._lb.scale) return;
    if (cursorX !== undefined && cursorY !== undefined) {
      const rect = stage.getBoundingClientRect();
      const cx = cursorX - (rect.left + rect.width / 2);
      const cy = cursorY - (rect.top + rect.height / 2);
      const ratio = newScale / this._lb.scale;
      this._lb.tx = cx + ratio * (this._lb.tx - cx);
      this._lb.ty = cy + ratio * (this._lb.ty - cy);
    }
    this._lb.scale = newScale;
    if (newScale === 1) { this._lb.tx = 0; this._lb.ty = 0; }
    this._lbApplyTransform();
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

    const wrap = carousel.querySelector('.carousel-img-wrap');
    const img  = carousel.querySelector('.detail-carousel-img');
    const link = carousel.querySelector('.detail-carousel-link');

    // src 切り替え前にローディング状態を開始
    if (wrap) wrap.classList.add('loading');
    if (link) link.href = photos[idx];
    if (img) {
      const onLoad = () => wrap?.classList.remove('loading');
      img.addEventListener('load',  onLoad, { once: true });
      img.addEventListener('error', onLoad, { once: true });
      img.src = photos[idx];
      img.alt = `名刺写真${idx + 1}`;
      // すでにキャッシュ済みで即時表示できる場合
      if (img.complete && img.naturalWidth > 0) wrap?.classList.remove('loading');
    }

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

  // ライトボックス イベント
  const lb = document.getElementById('photo-lightbox');
  if (lb) {
    lb.querySelector('.lightbox-close').addEventListener('click', () => DetailModal._closeLightbox());

    lb.querySelector('.lightbox-prev').addEventListener('click', () => {
      const { photos, idx } = DetailModal._lb;
      if (photos.length <= 1) return;
      DetailModal._lb.idx = (idx - 1 + photos.length) % photos.length;
      DetailModal._lbUpdateImage();
    });

    lb.querySelector('.lightbox-next').addEventListener('click', () => {
      const { photos, idx } = DetailModal._lb;
      if (photos.length <= 1) return;
      DetailModal._lb.idx = (idx + 1) % photos.length;
      DetailModal._lbUpdateImage();
    });

    // Ctrl+ホイールでズーム
    const stage = lb.querySelector('.lightbox-stage');
    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      DetailModal._lbZoom(e.deltaY > 0 ? 0.85 : 1.18, e.clientX, e.clientY);
    }, { passive: false });

    // マウスドラッグでパン
    stage.addEventListener('mousedown', (e) => {
      if (DetailModal._lb.scale <= 1) return;
      DetailModal._lb.dragging = true;
      DetailModal._lb.lastX = e.clientX;
      DetailModal._lb.lastY = e.clientY;
      DetailModal._lbApplyTransform(true);
    });

    document.addEventListener('mousemove', (e) => {
      if (!DetailModal._lb.dragging) return;
      DetailModal._lb.tx += e.clientX - DetailModal._lb.lastX;
      DetailModal._lb.ty += e.clientY - DetailModal._lb.lastY;
      DetailModal._lb.lastX = e.clientX;
      DetailModal._lb.lastY = e.clientY;
      DetailModal._lbApplyTransform(true);
    });

    document.addEventListener('mouseup', () => {
      if (DetailModal._lb.dragging) {
        DetailModal._lb.dragging = false;
        DetailModal._lbApplyTransform(true);
      }
    });

    // タッチ：ピンチズーム＆パン＆スワイプナビ
    let lbSwipeStartX = 0, lbSwipeStartY = 0;

    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        DetailModal._lb.pinchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        DetailModal._lb.pinchStartScale = DetailModal._lb.scale;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        lbSwipeStartX = e.touches[0].clientX;
        lbSwipeStartY = e.touches[0].clientY;
        if (DetailModal._lb.scale > 1) {
          DetailModal._lb.dragging = true;
          DetailModal._lb.lastX = e.touches[0].clientX;
          DetailModal._lb.lastY = e.touches[0].clientY;
        }
      }
    }, { passive: false });

    stage.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const newScale = Math.max(1, Math.min(5, DetailModal._lb.pinchStartScale * (dist / DetailModal._lb.pinchStartDist)));
        DetailModal._lb.scale = newScale;
        if (newScale === 1) { DetailModal._lb.tx = 0; DetailModal._lb.ty = 0; }
        DetailModal._lbApplyTransform(true);
        e.preventDefault();
      } else if (e.touches.length === 1 && DetailModal._lb.dragging) {
        DetailModal._lb.tx += e.touches[0].clientX - DetailModal._lb.lastX;
        DetailModal._lb.ty += e.touches[0].clientY - DetailModal._lb.lastY;
        DetailModal._lb.lastX = e.touches[0].clientX;
        DetailModal._lb.lastY = e.touches[0].clientY;
        DetailModal._lbApplyTransform(true);
        e.preventDefault();
      }
    }, { passive: false });

    stage.addEventListener('touchend', (e) => {
      DetailModal._lb.dragging = false;
      DetailModal._lbApplyTransform(true);
      // スワイプでナビゲーション（スケール等倍時のみ）
      if (e.changedTouches.length === 1 && e.touches.length === 0 && DetailModal._lb.scale <= 1) {
        const dx = e.changedTouches[0].clientX - lbSwipeStartX;
        const dy = e.changedTouches[0].clientY - lbSwipeStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          const { photos, idx } = DetailModal._lb;
          if (photos.length > 1) {
            DetailModal._lb.idx = dx < 0
              ? (idx + 1) % photos.length
              : (idx - 1 + photos.length) % photos.length;
            DetailModal._lbUpdateImage();
          }
        }
      }
    }, { passive: true });

    // キーボード操作
    document.addEventListener('keydown', (e) => {
      if (lb.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        DetailModal._closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        const { photos, idx } = DetailModal._lb;
        if (photos.length > 1) { DetailModal._lb.idx = (idx - 1 + photos.length) % photos.length; DetailModal._lbUpdateImage(); }
      } else if (e.key === 'ArrowRight') {
        const { photos, idx } = DetailModal._lb;
        if (photos.length > 1) { DetailModal._lb.idx = (idx + 1) % photos.length; DetailModal._lbUpdateImage(); }
      }
    });
  }

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
