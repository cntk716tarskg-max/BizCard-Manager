/**
 * form.js
 * 追加・編集フォームのモーダルを制御する
 */

const PRESET_TAGS = [
  '高等学校', '中学校', '塾・予備校', '大学等',
  '入試関係', '生徒会関係', '進路関係', '教務関係',
  '数学', '探究', '企業',
];

const PHONE_TYPES = ['会社', '携帯', '自宅', 'FAX', 'その他'];

// -----------------------------------------------
// PhotoUploader：写真の追加・削除・プレビュー管理
// -----------------------------------------------
const PhotoUploader = {
  _photos: [], // base64文字列の配列

  /**
   * 初期化（新規→空配列、編集→既存写真をセット）
   * @param {string[]} existingPhotos
   */
  init(existingPhotos = []) {
    this._photos = [...existingPhotos];
    this.render();
  },

  /**
   * ファイル選択時：圧縮してから既存リストに追記する
   * @param {FileList|File[]} files
   */
  async onFileSelect(files) {
    this._showLoading(files.length);
    const results = [];
    for (const file of files) {
      try {
        const compressed = await this._compressImage(file);
        results.push(compressed);
      } catch (e) {
        console.warn('画像の圧縮に失敗しました:', e);
      }
    }
    this._photos.push(...results);
    this.render();
  },

  /**
   * 処理中プレースホルダーを表示する
   * @param {number} count
   */
  _showLoading(count) {
    const area = document.getElementById('photo-preview-area');
    // 既存サムネイルは残しつつ、ローディング枠を末尾に追加
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'photo-thumb-loading';
      el.innerHTML = `<span class="photo-thumb-spinner"></span>`;
      area.appendChild(el);
    }
  },

  /**
   * 指定インデックスの写真を削除する
   * @param {number} index
   */
  removePhoto(index) {
    this._photos.splice(index, 1);
    this.render();
  },

  /**
   * 写真エリアを再描画する
   * - 0枚：破線ボーダーのアップロードエリア
   * - 1枚以上：サムネイル＋末尾に「＋追加」ボタン
   */
  render() {
    const area = document.getElementById('photo-preview-area');
    area.innerHTML = '';

    if (this._photos.length === 0) {
      // 空状態：破線ボーダーのクリック領域
      const empty = document.createElement('label');
      empty.className = 'photo-upload-empty';
      empty.htmlFor = 'photo-input';
      empty.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>名刺写真をアップロード</span>
        <small>表・裏など複数枚可</small>`;
      area.appendChild(empty);
      return;
    }

    // 写真あり：サムネイル一覧（圧縮後サイズをバッジ表示）
    this._photos.forEach((src, idx) => {
      const sizeKB = this._calcSizeKB(src);
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb-wrap';
      wrap.innerHTML = `
        <img src="${src}" alt="写真${idx + 1}">
        <span class="photo-size-badge">${sizeKB}KB</span>
        <button type="button" class="photo-thumb-del" title="削除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>`;
      wrap.querySelector('.photo-thumb-del').addEventListener('click', () => {
        this.removePhoto(idx);
      });
      area.appendChild(wrap);
    });

    // 末尾に「＋追加」ボタン
    const addBtn = document.createElement('label');
    addBtn.className = 'photo-thumb-add';
    addBtn.htmlFor = 'photo-input';
    addBtn.title = '写真を追加';
    addBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>`;
    area.appendChild(addBtn);
  },

  /**
   * 画像をCanvasで圧縮してbase64（JPEG）を返す
   *
   * - 長辺が MAX_LONG_SIDE を超える場合は縮小
   * - 透過PNG等は白背景に変換してJPEGで出力
   * - 圧縮後にさらにサイズが大きければ品質を下げて再試行
   *
   * @param {File} file
   * @returns {Promise<string>} base64 JPEG
   */
  _compressImage(file) {
    const MAX_LONG_SIDE = 1600; // px（名刺写真として十分な解像度）
    const QUALITY_STEPS = [0.82, 0.70, 0.55]; // 順に試行する品質
    const SIZE_LIMIT_KB = 300; // この値以下になるまで品質を下げる

    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        // リサイズ後の寸法を計算
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const maxSide = Math.max(w, h);
        if (maxSide > MAX_LONG_SIDE) {
          const ratio = MAX_LONG_SIDE / maxSide;
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        // Canvasに描画（白背景で透過を潰す）
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        // 品質を段階的に下げて SIZE_LIMIT_KB 以内に収める
        let result = '';
        for (const quality of QUALITY_STEPS) {
          result = canvas.toDataURL('image/jpeg', quality);
          if (this._calcSizeKB(result) <= SIZE_LIMIT_KB) break;
        }

        resolve(result);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`"${file.name}" の読み込みに失敗しました`));
      };

      img.src = objectUrl;
    });
  },

  /**
   * base64文字列のおおよそのサイズ（KB）を返す
   * @param {string} base64
   * @returns {number}
   */
  _calcSizeKB(base64) {
    // data:image/jpeg;base64, の部分（≈23文字）を除いた実データ長から計算
    const dataLen = base64.length - (base64.indexOf(',') + 1);
    const padding = (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    return Math.max(1, Math.round((dataLen * 3) / 4 / 1024 - padding / 1024));
  },

  /**
   * 保存時に現在の写真リストを返す
   * @returns {string[]}
   */
  getPhotos() {
    return [...this._photos];
  },
};

const FormModal = {
  _editingId: null,
  _selectedTags: [], // 選択中のタグ（プリセット＋カスタム）

  /**
   * フォームモーダルを開く
   * @param {object|null} card - nullなら新規、cardオブジェクトなら編集
   */
  open(card = null) {
    this._editingId = card ? card.id : null;
    this._selectedTags = card ? [...(card.tags || [])] : [];

    const modal = document.getElementById('form-modal');
    const title = document.getElementById('form-modal-title');

    title.textContent = card ? '名刺を編集' : '名刺を追加';

    this._fillForm(card);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // フォーカスを氏名フィールドへ
    setTimeout(() => {
      document.getElementById('field-name').focus();
    }, 100);
  },

  /**
   * フォームモーダルを閉じる
   */
  close() {
    document.getElementById('form-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._editingId = null;
    this._selectedTags = [];
    PhotoUploader.init([]); // 写真リストをリセット
  },

  /**
   * フォームに値を設定する
   * @param {object|null} card
   */
  _fillForm(card) {
    // テキストフィールド
    const fields = ['name', 'kana', 'company', 'companyKana', 'department', 'position', 'zipCode', 'address', 'notes'];
    const idMap = {
      name: 'field-name', kana: 'field-kana', company: 'field-company',
      companyKana: 'field-company-kana',
      department: 'field-department', position: 'field-position',
      zipCode: 'field-zip', address: 'field-address', notes: 'field-notes',
    };
    fields.forEach(f => {
      const el = document.getElementById(idMap[f]);
      if (el) el.value = card ? (card[f] || '') : '';
    });

    // エラークリア
    document.getElementById('error-name').textContent = '';

    // 電話番号
    const phonesContainer = document.getElementById('phones-container');
    phonesContainer.innerHTML = '';
    const phones = card ? (card.phones || []) : [];
    if (phones.length > 0) {
      phones.forEach(p => this._addPhoneRow(p));
    }

    // メールアドレス
    const emailsContainer = document.getElementById('emails-container');
    emailsContainer.innerHTML = '';
    const emails = card ? (card.emails || []) : [];
    if (emails.length > 0) {
      emails.forEach(e => this._addEmailRow(e));
    }

    // 写真プレビュー（PhotoUploaderで初期化）
    PhotoUploader.init(card ? (card.photos || []) : []);

    // プリセットタグ
    this._renderPresetTags();

    // カスタムタグ（プリセット以外）
    this._renderCustomTags();

    // カスタムタグ入力欄クリア
    const tagInput = document.getElementById('field-tag-input');
    if (tagInput) tagInput.value = '';
  },

  // _renderPhotoPreview は PhotoUploader.render() に移行したため削除

  /**
   * 電話番号行を追加する
   * 「その他」を選択した場合は種別の自由入力フィールドを表示する。
   * 保存時は自由入力の値がそのまま type として格納される。
   * @param {object} phone - { id, type, number }
   */
  _addPhoneRow(phone = null) {
    const container = document.getElementById('phones-container');
    const rowId = phone ? phone.id : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const div = document.createElement('div');
    div.className = 'phone-row';
    div.dataset.phoneId = rowId;

    // 標準タイプ（「その他」以外）に含まれない値はカスタム扱い
    const STANDARD_TYPES = PHONE_TYPES.filter(t => t !== 'その他');
    const isCustom = phone && phone.type && !STANDARD_TYPES.includes(phone.type);
    const selectedType = isCustom ? 'その他' : (phone ? (phone.type || PHONE_TYPES[0]) : PHONE_TYPES[0]);
    const customValue = isCustom ? phone.type : '';

    const typeOptions = PHONE_TYPES.map(t =>
      `<option value="${t}" ${selectedType === t ? 'selected' : ''}>${t}</option>`
    ).join('');

    div.innerHTML = `
      <div class="phone-type-wrap">
        <select class="phone-type-select">${typeOptions}</select>
        <input type="text" class="phone-custom-type"
               placeholder="例）直通"
               value="${customValue}"
               style="display:${isCustom ? 'block' : 'none'}">
      </div>
      <input type="tel" class="phone-number-input" placeholder="03-0000-0000" value="${phone ? (phone.number || '') : ''}">
      <button type="button" class="btn-remove-row" title="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;

    // 「その他」選択時にカスタム入力を表示／非表示
    const select = div.querySelector('.phone-type-select');
    const customInput = div.querySelector('.phone-custom-type');
    select.addEventListener('change', () => {
      const show = select.value === 'その他';
      customInput.style.display = show ? 'block' : 'none';
      if (show) {
        customInput.focus();
      } else {
        customInput.value = '';
      }
    });

    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    container.appendChild(div);
  },

  /**
   * メールアドレス行を追加する
   * @param {string} email
   */
  _addEmailRow(email = '') {
    const container = document.getElementById('emails-container');
    const div = document.createElement('div');
    div.className = 'email-row';
    div.innerHTML = `
      <input type="email" class="email-input" placeholder="example@mail.com" value="${email}">
      <button type="button" class="btn-remove-row" title="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    container.appendChild(div);
  },

  /**
   * プリセットタグボタンを描画する
   */
  _renderPresetTags() {
    const container = document.getElementById('preset-tags');
    container.innerHTML = PRESET_TAGS.map(tag => {
      const isActive = this._selectedTags.includes(tag);
      return `<button type="button" class="preset-tag-btn${isActive ? ' active' : ''}" data-tag="${tag}">${tag}</button>`;
    }).join('');

    container.querySelectorAll('.preset-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        const idx = this._selectedTags.indexOf(tag);
        if (idx === -1) {
          this._selectedTags.push(tag);
        } else {
          this._selectedTags.splice(idx, 1);
        }
        btn.classList.toggle('active', this._selectedTags.includes(tag));
      });
    });
  },

  /**
   * カスタムタグ（プリセット以外）を描画する
   */
  _renderCustomTags() {
    const area = document.getElementById('custom-tags-area');
    const customTags = this._selectedTags.filter(t => !PRESET_TAGS.includes(t));
    area.innerHTML = customTags.map(tag => `
      <span class="custom-tag-chip">
        ${tag}
        <button type="button" class="custom-tag-del" data-tag="${tag}" title="削除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </span>`).join('');

    area.querySelectorAll('.custom-tag-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        const idx = this._selectedTags.indexOf(tag);
        if (idx !== -1) this._selectedTags.splice(idx, 1);
        this._renderCustomTags();
      });
    });
  },

  /**
   * フォームデータを収集してオブジェクトを返す
   * @returns {object}
   */
  _collectFormData() {
    const val = id => document.getElementById(id)?.value.trim() || '';

    // 電話番号（「その他」選択時はカスタム入力値を type として使用）
    const phones = [];
    document.querySelectorAll('#phones-container .phone-row').forEach(row => {
      const select = row.querySelector('.phone-type-select');
      const customInput = row.querySelector('.phone-custom-type');
      const number = row.querySelector('.phone-number-input')?.value.trim() || '';
      let type = select?.value || '';
      if (type === 'その他') {
        type = customInput?.value.trim() || 'その他';
      }
      if (number) {
        phones.push({ id: row.dataset.phoneId, type, number });
      }
    });

    // メールアドレス
    const emails = [];
    document.querySelectorAll('#emails-container .email-input').forEach(inp => {
      const v = inp.value.trim();
      if (v) emails.push(v);
    });

    return {
      name:        val('field-name'),
      kana:        val('field-kana'),
      company:     val('field-company'),
      companyKana: val('field-company-kana'),
      department:  val('field-department'),
      position:   val('field-position'),
      zipCode:    val('field-zip'),
      address:    val('field-address'),
      notes:      val('field-notes'),
      phones,
      emails,
      tags:       [...this._selectedTags],
      photos:     PhotoUploader.getPhotos(),
      isFavorite: this._editingId
        ? (CardService.getById(this._editingId)?.isFavorite ?? false)
        : false,
    };
  },

  /**
   * バリデーション → 写真アップロード → Firestore 保存 → モーダルを閉じる
   */
  async save() {
    const data = this._collectFormData();

    // バリデーション
    const errorEl = document.getElementById('error-name');
    if (!data.name) {
      errorEl.textContent = '氏名は必須です';
      document.getElementById('field-name').focus();
      return;
    }
    errorEl.textContent = '';

    const saveBtn = document.getElementById('form-save-btn');
    UI.setButtonLoading(saveBtn, true, '保存中...');

    try {
      if (this._editingId) {
        await CardService.update(this._editingId, data);
      } else {
        await CardService.add(data);
      }
      this.close();
    } catch (e) {
      console.error('保存エラー:', e);
      alert('保存に失敗しました。ネットワーク接続を確認してください。');
      UI.setButtonLoading(saveBtn, false, '保存する');
    }
  },
};

// -----------------------------------------------
// フォームモーダルのイベント設定（DOMContentLoaded後）
// -----------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // 閉じるボタン
  document.getElementById('form-modal-close').addEventListener('click', () => FormModal.close());
  document.getElementById('form-cancel-btn').addEventListener('click', () => FormModal.close());

  // 保存ボタン
  document.getElementById('form-save-btn').addEventListener('click', () => FormModal.save());

  // オーバーレイクリックで閉じる
  document.getElementById('form-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) FormModal.close();
  });

  // 電話番号追加
  document.getElementById('btn-add-phone').addEventListener('click', () => FormModal._addPhoneRow());

  // メール追加
  document.getElementById('btn-add-email').addEventListener('click', () => FormModal._addEmailRow());

  // 写真選択（既存写真に追記する）
  document.getElementById('photo-input').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await PhotoUploader.onFileSelect(files);
    e.target.value = ''; // 同じファイルの再選択を可能に
  });

  // カスタムタグ追加（ボタン）
  document.getElementById('btn-add-tag').addEventListener('click', () => {
    _addCustomTag();
  });

  // カスタムタグ追加（Enterキー）
  document.getElementById('field-tag-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      _addCustomTag();
    }
  });

  function _addCustomTag() {
    const input = document.getElementById('field-tag-input');
    const tag = input.value.trim();
    if (!tag) return;
    if (!FormModal._selectedTags.includes(tag)) {
      FormModal._selectedTags.push(tag);
      // プリセットにある場合はプリセットボタンをアクティブに
      const presetBtn = document.querySelector(`.preset-tag-btn[data-tag="${tag}"]`);
      if (presetBtn) presetBtn.classList.add('active');
      else FormModal._renderCustomTags();
    }
    input.value = '';
  }
});
