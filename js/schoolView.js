/**
 * schoolView.js
 * 中学校別ビュー — レンダリング・ドラッグ&ドロップ・各種モーダル
 */

// -----------------------------------------------
// SchoolPhotoUploader — 学校別フォーム用写真管理
// -----------------------------------------------
const SchoolPhotoUploader = {
  _photos: [],
  _containerId: 'sp-photo-area',

  init(existingPhotos = []) {
    this._photos = [...existingPhotos];
    this.render();
  },

  async onFileSelect(files) {
    const area = document.getElementById(this._containerId);
    for (let i = 0; i < files.length; i++) {
      const el = document.createElement('div');
      el.className = 'photo-thumb-loading';
      el.innerHTML = '<span class="photo-thumb-spinner"></span>';
      area.appendChild(el);
    }
    const results = await Promise.all(
      Array.from(files).map(f => this._compress(f).catch(() => null))
    );
    this._photos.push(...results.filter(Boolean));
    this.render();
  },

  removePhoto(idx) {
    this._photos.splice(idx, 1);
    this.render();
  },

  render() {
    const area = document.getElementById(this._containerId);
    if (!area) return;
    area.innerHTML = '';
    if (this._photos.length === 0) {
      const lbl = document.createElement('label');
      lbl.className = 'photo-upload-empty';
      lbl.htmlFor = 'sp-photo-input';
      lbl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>名刺写真をアップロード</span>`;
      area.appendChild(lbl);
      return;
    }
    this._photos.forEach((src, idx) => {
      const sizeKB = this._sizeKB(src);
      const wrap = document.createElement('div');
      wrap.className = 'photo-thumb-wrap';
      wrap.innerHTML = `
        <img src="${src}" alt="写真${idx + 1}">
        ${sizeKB > 0 ? `<span class="photo-size-badge">${sizeKB}KB</span>` : ''}
        <button type="button" class="photo-thumb-del" title="削除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>`;
      wrap.querySelector('.photo-thumb-del').addEventListener('click', () => this.removePhoto(idx));
      area.appendChild(wrap);
    });
    const addLbl = document.createElement('label');
    addLbl.className = 'photo-thumb-add';
    addLbl.htmlFor = 'sp-photo-input';
    addLbl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>`;
    area.appendChild(addLbl);
  },

  getPhotos() { return [...this._photos]; },

  _sizeKB(src) {
    if (!src.startsWith('data:')) return 0;
    const dl = src.length - (src.indexOf(',') + 1);
    const pad = src.endsWith('==') ? 2 : src.endsWith('=') ? 1 : 0;
    return Math.max(1, Math.round((dl * 3) / 4 / 1024 - pad / 1024));
  },

  _compress(file) {
    const MAX = 1600, STEPS = [0.82, 0.70, 0.55], LIMIT = 300;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        const m = Math.max(w, h);
        if (m > MAX) { const r = MAX / m; w = Math.round(w * r); h = Math.round(h * r); }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        let result = '';
        for (const q of STEPS) {
          result = canvas.toDataURL('image/jpeg', q);
          if (this._sizeKB(result) <= LIMIT) break;
        }
        resolve(result);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
      img.src = url;
    });
  },
};

// -----------------------------------------------
// SchoolView — メインレンダラー
// -----------------------------------------------
const SchoolView = {
  render() {
    const container = document.getElementById('school-blocks');
    if (!container) return;
    const q = SchoolState.searchQuery.toLowerCase();
    const schools = q
      ? SchoolState.schools.filter(s => s.name.toLowerCase().includes(q))
      : SchoolState.schools;

    container.innerHTML = schools.map(s => this._block(s)).join('');
    this._bindBlockEvents();
    SchoolDrag.bind();
  },

  _block(school) {
    const persons = SchoolDataService.getPersonsForSchool(school.id);
    const isSpecial = !!school.isSpecial;
    const blockClass = `school-block${isSpecial ? ' school-block--special' : ''}`;

    const catHtml = SCHOOL_CATEGORIES.map(cat => {
      const catPersons = persons.filter(p => (p.currentRecord?.categories || []).includes(cat));
      return `
        <div class="sc-category">
          <div class="sc-cat-label">
            <span>${UI._esc(cat)}</span>
            <button class="sc-cat-add" title="${UI._esc(cat)}に追加"
                    data-school-id="${UI._esc(school.id)}"
                    data-school-name="${UI._esc(school.name)}"
                    data-category="${UI._esc(cat)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
          <div class="sc-cat-persons">
            ${catPersons.length ? catPersons.map(p => this._chip(p)).join('') : '<span class="sc-cat-empty">—</span>'}
          </div>
        </div>`;
    }).join('');

    const uncatPersons = persons.filter(
      p => !(p.currentRecord?.categories || []).some(c => SCHOOL_CATEGORIES.includes(c))
    );
    const uncatHtml = uncatPersons.length ? `
      <div class="sc-category">
        <div class="sc-cat-label">未分類</div>
        <div class="sc-cat-persons">
          ${uncatPersons.map(p => this._chip(p)).join('')}
        </div>
      </div>` : '';

    return `
      <div class="${blockClass}"
           data-school-id="${UI._esc(school.id)}"
           data-school-name="${UI._esc(school.name)}">
        <div class="sc-block-header">
          ${!school.isSpecial
            ? `<button class="sc-block-name sc-block-name--btn"
                       data-school-id="${UI._esc(school.id)}"
                       title="学校情報を見る">${UI._esc(school.name)}</button>`
            : `<span class="sc-block-name">${UI._esc(school.name)}</span>`}
          <span class="sc-count-badge">${persons.length}人</span>
        </div>
        <div class="sc-block-body">
          ${catHtml}${uncatHtml}
        </div>
        <button class="sc-add-btn"
                data-school-id="${UI._esc(school.id)}"
                data-school-name="${UI._esc(school.name)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          人を追加
        </button>
      </div>`;
  },

  _chip(person) {
    const cats = (person.currentRecord?.categories || []).join('・');
    return `
      <div class="person-chip" data-person-id="${person.id}">
        <span class="chip-drag-handle" title="ドラッグして移動">
          <svg viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/>
            <circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/>
            <circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/>
          </svg>
        </span>
        <div class="chip-info">
          <span class="chip-name">${UI._esc(person.name)}</span>
          ${cats ? `<span class="chip-cats">${UI._esc(cats)}</span>` : ''}
        </div>
      </div>`;
  },

  _bindBlockEvents() {
    // 学校名クリック → 学校情報モーダル
    document.querySelectorAll('.sc-block-name--btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        SchoolInfoModal.open(btn.dataset.schoolId);
      });
    });
    // カテゴリ別 + ボタン
    document.querySelectorAll('.sc-cat-add').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        SchoolPersonModal.openAdd(btn.dataset.schoolId, btn.dataset.schoolName, btn.dataset.category);
      });
    });
    // + 人を追加（ブロック下部）
    document.querySelectorAll('.sc-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        SchoolPersonModal.openAdd(btn.dataset.schoolId, btn.dataset.schoolName);
      });
    });
    // chip info クリック → 詳細
    document.querySelectorAll('.chip-info').forEach(info => {
      info.addEventListener('click', () => {
        if (SchoolDrag.isDragging()) return;
        const personId = info.closest('.person-chip').dataset.personId;
        SchoolPersonDetailModal.open(personId);
      });
    });
  },
};

// -----------------------------------------------
// SchoolDrag — ドラッグ&ドロップ（mouse + touch）
// -----------------------------------------------
const SchoolDrag = {
  _d: null,
  _setupDone: false,

  setup() {
    if (this._setupDone) return;
    this._setupDone = true;
    document.addEventListener('mousemove', e => this._move(e.clientX, e.clientY));
    document.addEventListener('mouseup',   () => this._end());
    document.addEventListener('touchmove', e => {
      if (!this._d) return;
      e.preventDefault();
      this._move(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    document.addEventListener('touchend',    () => this._end());
    document.addEventListener('touchcancel', () => this._cancel());
  },

  bind() {
    // ドラッグハンドル — mouse
    document.querySelectorAll('.chip-drag-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        this._start(handle.closest('.person-chip'), e.clientX, e.clientY);
      });
    });
    // ドラッグハンドル — touch (long press 200ms)
    document.querySelectorAll('.chip-drag-handle').forEach(handle => {
      let timer, startX, startY;
      handle.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        timer = setTimeout(() => {
          timer = null;
          this._start(handle.closest('.person-chip'), startX, startY);
        }, 200);
      }, { passive: true });
      handle.addEventListener('touchmove', e => {
        if (!timer) return;
        if (Math.abs(e.touches[0].clientX - startX) > 8 ||
            Math.abs(e.touches[0].clientY - startY) > 8) {
          clearTimeout(timer); timer = null;
        }
      }, { passive: true });
      handle.addEventListener('touchend', () => { clearTimeout(timer); timer = null; });
    });
  },

  _start(chip, cx, cy) {
    const block = chip.closest('[data-school-id]');
    if (!block) return;
    const rect = chip.getBoundingClientRect();
    const ghost = chip.cloneNode(true);
    ghost.classList.add('person-chip-ghost');
    Object.assign(ghost.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '9999',
      left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px',
    });
    document.body.appendChild(ghost);
    chip.classList.add('chip-dragging');
    this._d = {
      personId: chip.dataset.personId,
      sourceSchoolId: block.dataset.schoolId,
      chip, ghost,
      startX: cx, startY: cy,
      baseLeft: rect.left, baseTop: rect.top,
      dropTarget: null,
    };
  },

  _move(x, y) {
    if (!this._d) return;
    const { ghost, startX, startY, baseLeft, baseTop } = this._d;
    ghost.style.left = (baseLeft + x - startX) + 'px';
    ghost.style.top  = (baseTop  + y - startY) + 'px';

    ghost.style.visibility = 'hidden';
    const el = document.elementFromPoint(x, y);
    ghost.style.visibility = '';

    const block    = el?.closest('[data-school-id]');
    const targetId = block?.dataset.schoolId;

    document.querySelectorAll('.school-block-drop').forEach(b =>
      b.classList.remove('school-block-drop'));
    if (block && targetId !== this._d.sourceSchoolId) {
      block.classList.add('school-block-drop');
      this._d.dropTarget = { schoolId: targetId, schoolName: block.dataset.schoolName };
    } else {
      this._d.dropTarget = null;
    }
  },

  _end() {
    if (!this._d) return;
    const { chip, ghost, personId, dropTarget } = this._d;
    ghost.remove();
    chip.classList.remove('chip-dragging');
    document.querySelectorAll('.school-block-drop').forEach(b =>
      b.classList.remove('school-block-drop'));
    const target = this._d.dropTarget;
    this._d = null;
    if (target) {
      const person = SchoolState.persons.find(p => p.id === personId);
      if (person) SchoolMoveModal.open(person, target.schoolId, target.schoolName);
    }
  },

  _cancel() {
    if (!this._d) return;
    this._d.ghost.remove();
    this._d.chip.classList.remove('chip-dragging');
    document.querySelectorAll('.school-block-drop').forEach(b =>
      b.classList.remove('school-block-drop'));
    this._d = null;
  },

  isDragging() { return !!this._d; },
};

// -----------------------------------------------
// SchoolInfoModal — 学校情報の閲覧（電話・住所）
// -----------------------------------------------
const SchoolInfoModal = {
  _schoolId: null,

  open(schoolId) {
    const school = SchoolState.schools.find(s => s.id === schoolId);
    if (!school || school.isSpecial) return;
    this._schoolId = schoolId;
    document.getElementById('sc-info-title').textContent = school.name;
    const esc = UI._esc.bind(UI);
    const phones    = school.phones    || [];
    const addresses = school.addresses || [];
    let html = '';

    if (phones.length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">電話番号</div>
        <ul class="detail-list">
          ${phones.map(p => `<li>
            <span class="phone-type-badge">${esc(p.type)}</span>
            <a href="tel:${esc(p.number)}">${esc(p.number)}</a>
          </li>`).join('')}
        </ul>
      </div>`;
    } else {
      html += `<p class="sc-info-empty">電話番号はまだ登録されていません。</p>`;
    }

    if (addresses.length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">住所</div>
        ${addresses.map(addr => {
          const full   = [addr.zipCode ? `〒${addr.zipCode}` : '', addr.address].filter(Boolean).join('　');
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.address || '')}`;
          return `<div class="detail-address-item">
            ${addr.label ? `<span class="address-label-badge">${esc(addr.label)}</span>` : ''}
            <div class="detail-address-row">
              <div class="detail-value">${esc(full)}</div>
              ${addr.address ? `<button class="btn-map" onclick="window.open('${mapUrl}','_blank')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>地図を開く</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    } else {
      html += `<p class="sc-info-empty">住所はまだ登録されていません。</p>`;
    }

    document.getElementById('sc-info-body').innerHTML = html;
    document.getElementById('sc-info-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('sc-info-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._schoolId = null;
  },

  edit() {
    const id = this._schoolId;
    this.close();
    SchoolContactModal.open(id);
  },

  async delete() {
    const school = SchoolState.schools.find(s => s.id === this._schoolId);
    if (!school) return;
    const persons = SchoolDataService.getPersonsForSchool(this._schoolId);
    const msg = persons.length
      ? `「${school.name}」を削除しますか？\n\n${persons.length}人が登録されています。削除すると全員「登録外」に移動されます。`
      : `「${school.name}」を削除しますか？`;
    if (!confirm(msg)) return;
    const btn = document.getElementById('sc-info-delete-btn');
    if (btn) { btn.disabled = true; btn.textContent = '削除中...'; }
    const id = this._schoolId;
    try {
      await SchoolDataService.deleteSchool(id);
      this.close();
      SchoolView.render();
    } catch (e) {
      console.error('学校削除エラー:', e);
      alert('削除に失敗しました。');
      if (btn) { btn.disabled = false; btn.textContent = '削除'; }
    }
  },
};

// -----------------------------------------------
// SchoolContactModal — 学校の電話番号・住所を編集
// -----------------------------------------------
const SchoolContactModal = {
  _schoolId: null,

  open(schoolId) {
    const school = SchoolState.schools.find(s => s.id === schoolId);
    if (!school || school.isSpecial) return;
    this._schoolId = schoolId;
    document.getElementById('sc-contact-school-name').textContent = school.name;
    const phonesContainer = document.getElementById('sc-contact-phones');
    phonesContainer.innerHTML = '';
    (school.phones || []).forEach(p => this._addPhone(p));
    const addressesContainer = document.getElementById('sc-contact-addresses');
    addressesContainer.innerHTML = '';
    (school.addresses || []).forEach(a => this._addAddress(a));
    document.getElementById('sc-contact-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('sc-contact-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._schoolId = null;
  },

  _addPhone(phone = null) {
    const TYPES = ['代表', '直通', '携帯', 'FAX', 'その他'];
    const container = document.getElementById('sc-contact-phones');
    const rowId = phone?.id || `sc_p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const isCustom = phone?.type && !TYPES.slice(0, -1).includes(phone.type);
    const selType  = isCustom ? 'その他' : (phone?.type || TYPES[0]);
    const div = document.createElement('div');
    div.className = 'phone-row'; div.dataset.phoneId = rowId;
    div.innerHTML = `
      <div class="phone-type-wrap">
        <select class="phone-type-select">
          ${TYPES.map(t => `<option value="${t}"${selType===t?' selected':''}>${t}</option>`).join('')}
        </select>
        <input type="text" class="phone-custom-type" placeholder="例）代表"
               value="${isCustom ? UI._esc(phone.type) : ''}" style="display:${isCustom?'block':'none'}">
      </div>
      <input type="tel" class="phone-number-input" placeholder="03-0000-0000"
             value="${UI._esc(phone?.number || '')}">
      <button type="button" class="btn-remove-row" title="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    const sel  = div.querySelector('.phone-type-select');
    const cust = div.querySelector('.phone-custom-type');
    sel.addEventListener('change', () => {
      const show = sel.value === 'その他';
      cust.style.display = show ? 'block' : 'none';
      if (show) cust.focus(); else cust.value = '';
    });
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    container.appendChild(div);
  },

  _addAddress(addr = null) {
    const container = document.getElementById('sc-contact-addresses');
    const div = document.createElement('div');
    div.className = 'address-row';
    div.innerHTML = `
      <input type="text" class="address-label-input" placeholder="ラベル（例：本校）" value="${UI._esc(addr?.label || '')}">
      <input type="text" class="address-zip-input"   placeholder="郵便番号（例：123-4567）" value="${UI._esc(addr?.zipCode || '')}">
      <input type="text" class="address-text-input"  placeholder="住所" value="${UI._esc(addr?.address || '')}">
      <button type="button" class="btn-remove-row" title="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    container.appendChild(div);
  },

  async save() {
    const phones = [];
    document.querySelectorAll('#sc-contact-phones .phone-row').forEach(row => {
      const sel  = row.querySelector('.phone-type-select');
      const cust = row.querySelector('.phone-custom-type');
      const num  = row.querySelector('.phone-number-input')?.value.trim() || '';
      let type = sel?.value || '';
      if (type === 'その他') type = cust?.value.trim() || 'その他';
      if (num) phones.push({ id: row.dataset.phoneId, type, number: num });
    });
    const addresses = [];
    document.querySelectorAll('#sc-contact-addresses .address-row').forEach(row => {
      const label   = row.querySelector('.address-label-input')?.value.trim() || '';
      const zipCode = row.querySelector('.address-zip-input')?.value.trim() || '';
      const address = row.querySelector('.address-text-input')?.value.trim() || '';
      if (zipCode || address) addresses.push({ label, zipCode, address });
    });
    const btn = document.getElementById('sc-contact-save');
    btn.disabled = true; btn.textContent = '保存中...';
    try {
      await SchoolDataService.updateSchoolContacts(this._schoolId, { phones, addresses });
      this.close();
    } catch (e) {
      console.error('学校連絡先保存エラー:', e);
      alert('保存に失敗しました。');
      btn.disabled = false; btn.textContent = '保存する';
    }
  },
};

// -----------------------------------------------
// SchoolPersonModal — 人物の追加・編集フォーム
// -----------------------------------------------
const SchoolPersonModal = {
  _editingId: null,
  _schoolId: null,
  _schoolName: null,

  openAdd(schoolId = null, schoolName = null, defaultCategory = null) {
    this._editingId  = null;
    this._schoolId   = schoolId;
    this._schoolName = schoolName;
    this._fill(null);

    const schoolInput  = document.getElementById('sp-field-school');
    const schoolSelect = document.getElementById('sp-school-select');
    const schoolReq    = document.getElementById('sp-school-required');
    if (schoolId) {
      schoolInput.classList.remove('hidden');
      schoolSelect.classList.add('hidden');
      if (schoolReq) schoolReq.style.display = 'none';
    } else {
      const normalSchools = SchoolState.schools.filter(s => !s.isSpecial);
      schoolSelect.innerHTML = '<option value="">学校を選択してください</option>' +
        normalSchools.map(s =>
          `<option value="${UI._esc(s.id)}" data-name="${UI._esc(s.name)}">${UI._esc(s.name)}</option>`
        ).join('');
      schoolInput.classList.add('hidden');
      schoolSelect.classList.remove('hidden');
      if (schoolReq) schoolReq.style.display = '';
    }

    if (defaultCategory) {
      const cb = document.querySelector(`.sp-cat-cb[value="${defaultCategory}"]`);
      if (cb) cb.checked = true;
    }
    document.getElementById('sp-form-title').textContent = '人を追加';
    document.getElementById('sp-form-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('sp-field-name')?.focus(), 100);
  },

  openEdit(personId) {
    const person = SchoolState.persons.find(p => p.id === personId);
    if (!person) return;
    this._editingId  = personId;
    this._schoolId   = person.currentRecord.schoolId;
    this._schoolName = person.currentRecord.schoolName;
    this._fill(person);
    document.getElementById('sp-form-title').textContent = '情報を編集';
    document.getElementById('sp-form-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('sp-form-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._editingId = this._schoolId = this._schoolName = null;
    // school フィールドをreadonly表示に戻す
    document.getElementById('sp-field-school')?.classList.remove('hidden');
    const schoolSelect = document.getElementById('sp-school-select');
    if (schoolSelect) { schoolSelect.innerHTML = ''; schoolSelect.classList.add('hidden'); }
    const schoolReq = document.getElementById('sp-school-required');
    if (schoolReq) schoolReq.style.display = 'none';
    const schoolErrEl = document.getElementById('sp-error-school');
    if (schoolErrEl) schoolErrEl.textContent = '';
    // ボタンリセット
    const btn = document.getElementById('sp-form-save');
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.ot || '保存する'; delete btn.dataset.ot; }
    SchoolPhotoUploader.init([]);
  },

  _fill(person) {
    const rec = person?.currentRecord;
    document.getElementById('sp-field-school').value   = this._schoolName || '';
    document.getElementById('sp-field-name').value     = person?.name || '';
    document.getElementById('sp-field-kana').value     = person?.kana || '';
    document.getElementById('sp-field-position').value = rec?.position || '';
    document.getElementById('sp-field-notes').value    = rec?.notes || '';
    document.getElementById('sp-error-name').textContent = '';

    // カテゴリー checkboxes
    const cats = document.querySelectorAll('.sp-cat-cb');
    cats.forEach(cb => { cb.checked = (rec?.categories || []).includes(cb.value); });

    // 学校の電話番号・住所プレビュー（読み取り専用）
    const school = SchoolState.schools.find(s => s.id === this._schoolId);
    const phonesPreview = document.getElementById('sp-school-phones-preview');
    if (phonesPreview) {
      const sp = school?.phones || [];
      phonesPreview.innerHTML = sp.length
        ? sp.map(p => `<div class="sc-contact-readonly">
            <span class="phone-type-badge">${UI._esc(p.type)}</span>${UI._esc(p.number)}
          </div>`).join('')
        : '<span class="sc-preview-empty">学校に電話番号が登録されていません</span>';
    }
    const addressesPreview = document.getElementById('sp-school-addresses-preview');
    if (addressesPreview) {
      const sa = school?.addresses || [];
      addressesPreview.innerHTML = sa.length
        ? sa.map(a => {
            const full = [a.zipCode ? `〒${a.zipCode}` : '', a.address].filter(Boolean).join('　');
            return `<div class="sc-contact-readonly">
              ${a.label ? `<span class="address-label-badge">${UI._esc(a.label)}</span>` : ''}
              ${UI._esc(full)}
            </div>`;
          }).join('')
        : '<span class="sc-preview-empty">学校に住所が登録されていません</span>';
    }

    // 個人の追加電話番号
    document.getElementById('sp-phones-container').innerHTML = '';
    (rec?.phones || []).forEach(p => this._addPhone(p));

    // メール
    document.getElementById('sp-emails-container').innerHTML = '';
    (rec?.emails || []).forEach(e => this._addEmail(e));

    // 写真
    SchoolPhotoUploader.init(rec?.photos || []);
  },

  _addPhone(phone = null) {
    const TYPES = ['会社', '携帯', '自宅', 'FAX', 'その他'];
    const container = document.getElementById('sp-phones-container');
    const rowId = phone?.id || `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const STANDARD = TYPES.filter(t => t !== 'その他');
    const isCustom = phone?.type && !STANDARD.includes(phone.type);
    const selType  = isCustom ? 'その他' : (phone?.type || TYPES[0]);
    const div = document.createElement('div');
    div.className = 'phone-row'; div.dataset.phoneId = rowId;
    div.innerHTML = `
      <div class="phone-type-wrap">
        <select class="phone-type-select">
          ${TYPES.map(t => `<option value="${t}"${selType===t?' selected':''}>${t}</option>`).join('')}
        </select>
        <input type="text" class="phone-custom-type" placeholder="例）直通"
               value="${isCustom ? phone.type : ''}" style="display:${isCustom?'block':'none'}">
      </div>
      <input type="tel" class="phone-number-input" placeholder="03-0000-0000"
             value="${phone?.number || ''}">
      <button type="button" class="btn-remove-row" title="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    const sel = div.querySelector('.phone-type-select');
    const cust = div.querySelector('.phone-custom-type');
    sel.addEventListener('change', () => {
      const show = sel.value === 'その他';
      cust.style.display = show ? 'block' : 'none';
      if (show) cust.focus(); else cust.value = '';
    });
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    container.appendChild(div);
  },

  _addEmail(email = '') {
    const container = document.getElementById('sp-emails-container');
    const div = document.createElement('div');
    div.className = 'email-row';
    div.innerHTML = `
      <input type="email" class="email-input" placeholder="example@mail.com" value="${UI._esc(email)}">
      <button type="button" class="btn-remove-row" title="削除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    container.appendChild(div);
  },

  _addAddress(addr = {}) {
    const container = document.getElementById('sp-addresses-container');
    const div = document.createElement('div');
    div.className = 'address-row';
    div.innerHTML = `
      <div class="address-row-header">
        <input type="text" class="address-label-input"
               placeholder="本社・支社・自宅など（省略可）" value="${UI._esc(addr.label || '')}">
        <button type="button" class="btn-remove-row" title="削除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <input type="text" class="address-zip-input" placeholder="郵便番号（例: 123-4567）"
             value="${UI._esc(addr.zipCode || '')}">
      <textarea class="address-text-input" rows="2"
                placeholder="東京都千代田区〇〇1-2-3">${UI._esc(addr.address || '')}</textarea>`;
    div.querySelector('.btn-remove-row').addEventListener('click', () => div.remove());
    container.appendChild(div);
  },

  _collect() {
    const val = id => document.getElementById(id)?.value.trim() || '';
    const categories = Array.from(document.querySelectorAll('.sp-cat-cb:checked'))
      .map(cb => cb.value);
    const phones = [];
    document.querySelectorAll('#sp-phones-container .phone-row').forEach(row => {
      const sel   = row.querySelector('.phone-type-select');
      const cust  = row.querySelector('.phone-custom-type');
      const num   = row.querySelector('.phone-number-input')?.value.trim() || '';
      let type = sel?.value || '';
      if (type === 'その他') type = cust?.value.trim() || 'その他';
      if (num) phones.push({ id: row.dataset.phoneId, type, number: num });
    });
    const emails = Array.from(document.querySelectorAll('#sp-emails-container .email-input'))
      .map(i => i.value.trim()).filter(Boolean);
    const addresses = [];
    document.querySelectorAll('#sp-addresses-container .address-row').forEach(row => {
      const label   = row.querySelector('.address-label-input')?.value.trim() || '';
      const zipCode = row.querySelector('.address-zip-input')?.value.trim() || '';
      const address = row.querySelector('.address-text-input')?.value.trim() || '';
      if (zipCode || address) addresses.push({ label, zipCode, address });
    });
    let schoolId   = this._schoolId;
    let schoolName = this._schoolName;
    if (!schoolId) {
      const sel = document.getElementById('sp-school-select');
      if (sel?.value) {
        schoolId   = sel.value;
        schoolName = sel.options[sel.selectedIndex]?.dataset.name || '';
      }
    }
    return {
      name:       val('sp-field-name'),
      kana:       val('sp-field-kana'),
      position:   val('sp-field-position'),
      notes:      val('sp-field-notes'),
      schoolId,
      schoolName,
      categories, phones, emails, addresses,
      photos: SchoolPhotoUploader.getPhotos(),
    };
  },

  async save() {
    const data = this._collect();
    const errEl = document.getElementById('sp-error-name');
    const schoolErrEl = document.getElementById('sp-error-school');
    if (schoolErrEl) schoolErrEl.textContent = '';
    if (!data.schoolId) {
      if (schoolErrEl) schoolErrEl.textContent = '学校を選択してください';
      document.getElementById('sp-school-select')?.focus();
      return;
    }
    if (!data.name) {
      errEl.textContent = '氏名は必須です';
      document.getElementById('sp-field-name')?.focus();
      return;
    }
    errEl.textContent = '';
    const btn = document.getElementById('sp-form-save');
    btn.disabled = true;
    btn.dataset.ot = btn.textContent;
    btn.innerHTML = '<span class="btn-spinner"></span>保存中...';
    try {
      if (this._editingId) {
        await SchoolDataService.updatePerson(this._editingId, data);
      } else {
        await SchoolDataService.addPerson(data);
      }
      this.close();
      SchoolView.render();
    } catch (e) {
      console.error('保存エラー:', e);
      alert('保存に失敗しました。');
      btn.disabled = false;
      btn.textContent = btn.dataset.ot || '保存する';
    }
  },
};

// -----------------------------------------------
// SchoolMoveModal — 学校移動確認
// -----------------------------------------------
const SchoolMoveModal = {
  _personId: null,
  _newSchoolId: null,
  _newSchoolName: null,

  open(person, newSchoolId, newSchoolName) {
    this._personId    = person.id;
    this._newSchoolId = newSchoolId;
    this._newSchoolName = newSchoolName;
    const fromName = person.currentRecord?.schoolName || '（未所属）';
    document.getElementById('sp-move-body').innerHTML = `
      <div class="move-person-name">「${UI._esc(person.name)}」さんを移動します</div>
      <div class="move-arrow-row">
        <div class="move-school-from">
          <span class="move-label">移動元</span>
          <span class="move-school-name">${UI._esc(fromName)}</span>
        </div>
        <div class="move-arrow">→</div>
        <div class="move-school-to">
          <span class="move-label">移動先</span>
          <span class="move-school-name move-school-name--new">${UI._esc(newSchoolName)}</span>
        </div>
      </div>
      <p class="move-note">※ 現在の連絡先情報はリセットされます。<br>移動後に新しい情報を入力してください。</p>`;
    document.getElementById('sp-move-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  close() {
    document.getElementById('sp-move-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._personId = this._newSchoolId = this._newSchoolName = null;
  },

  async confirm() {
    const btn = document.getElementById('sp-move-confirm');
    btn.disabled = true;
    btn.textContent = '移動中...';
    try {
      await SchoolDataService.movePerson(this._personId, this._newSchoolId, this._newSchoolName);
      const personId = this._personId;
      this.close();
      SchoolView.render();
      // 移動後すぐに編集モーダルを開く
      SchoolPersonModal.openEdit(personId);
    } catch (e) {
      console.error('移動エラー:', e);
      alert('移動に失敗しました。');
      btn.disabled = false;
      btn.textContent = '移動して情報を入力';
    }
  },
};

// -----------------------------------------------
// _SpCarousel — 学校ビュー詳細モーダル用カルーセルヘルパー
// -----------------------------------------------
const _SpCarousel = {
  buildPanel(photos) {
    if (!photos.length) return `
      <div class="detail-no-photo">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="4" y="10" width="40" height="28" rx="4"/>
          <circle cx="17" cy="22" r="4"/>
          <path d="M4 34l10-10 8 8 6-6 16 12" stroke-linejoin="round"/>
        </svg>
        <span>写真なし</span>
      </div>`;
    const nav = photos.length > 1 ? `
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
          ${photos.map((_, i) => `<button class="carousel-dot${i===0?' active':''}" data-idx="${i}" aria-label="写真${i+1}"></button>`).join('')}
        </div>
      </div>` : '';
    return `
      <div class="detail-carousel">
        <div class="carousel-img-wrap loading">
          <div class="carousel-img-skeleton"></div>
          <a class="detail-carousel-link" title="クリックで拡大表示">
            <img class="detail-carousel-img" src="${photos[0]}" alt="名刺写真1">
          </a>
        </div>
        ${nav}${footer}
      </div>`;
  },

  init(photos, container, owner) {
    const carousel = container.querySelector('.detail-carousel');
    if (!carousel) return;
    const wrap = carousel.querySelector('.carousel-img-wrap');
    const img  = carousel.querySelector('.detail-carousel-img');
    if (wrap && img) {
      const onLoad = () => wrap.classList.remove('loading');
      if (img.complete && img.naturalWidth > 0) wrap.classList.remove('loading');
      else {
        img.addEventListener('load',  onLoad, { once: true });
        img.addEventListener('error', onLoad, { once: true });
      }
    }
    carousel.querySelector('.carousel-prev')?.addEventListener('click', () =>
      this.show(photos, (owner._photoIdx - 1 + photos.length) % photos.length, carousel, owner));
    carousel.querySelector('.carousel-next')?.addEventListener('click', () =>
      this.show(photos, (owner._photoIdx + 1) % photos.length, carousel, owner));
    carousel.querySelectorAll('.carousel-dot').forEach(dot => {
      dot.addEventListener('click', () =>
        this.show(photos, parseInt(dot.dataset.idx, 10), carousel, owner));
    });
    carousel.querySelector('.detail-carousel-link')?.addEventListener('click', e => {
      e.preventDefault();
      DetailModal._openLightbox(photos, owner._photoIdx);
    });
    if (photos.length > 1) {
      let sx = 0, sy = 0;
      carousel.addEventListener('touchstart', e => {
        if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
      }, { passive: true });
      carousel.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40)
          this.show(photos,
            dx < 0 ? (owner._photoIdx + 1) % photos.length
                   : (owner._photoIdx - 1 + photos.length) % photos.length,
            carousel, owner);
      }, { passive: true });
    }
  },

  show(photos, idx, carousel, owner) {
    owner._photoIdx = idx;
    const wrap = carousel.querySelector('.carousel-img-wrap');
    const img  = carousel.querySelector('.detail-carousel-img');
    if (wrap) wrap.classList.add('loading');
    if (img) {
      const onLoad = () => wrap?.classList.remove('loading');
      img.addEventListener('load',  onLoad, { once: true });
      img.addEventListener('error', onLoad, { once: true });
      img.src = photos[idx];
      img.alt = `名刺写真${idx + 1}`;
      if (img.complete && img.naturalWidth > 0) wrap?.classList.remove('loading');
    }
    const counter = carousel.querySelector('.carousel-counter');
    if (counter) counter.textContent = `${idx + 1} / ${photos.length}`;
    carousel.querySelectorAll('.carousel-dot').forEach((dot, i) => dot.classList.toggle('active', i === idx));
  },
};

// -----------------------------------------------
// SchoolPersonDetailModal — 人物詳細
// -----------------------------------------------
const SchoolPersonDetailModal = {
  _personId: null,
  _photoIdx: 0,

  open(personId) {
    const person = SchoolState.persons.find(p => p.id === personId);
    if (!person) return;
    this._personId = personId;
    this._photoIdx = 0;
    const photos = person.currentRecord?.photos || [];
    document.getElementById('sp-detail-title').textContent = person.name;
    const body = document.getElementById('sp-detail-body');
    body.innerHTML = `
      <div class="detail-layout">
        <div class="detail-photo-panel">${_SpCarousel.buildPanel(photos)}</div>
        <div class="detail-info-panel">${this._buildInfoPanel(person)}</div>
      </div>`;
    document.getElementById('sp-detail-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (photos.length) _SpCarousel.init(photos, body, this);
    this._bindHistoryEvents(person, body);
  },

  _buildInfoPanel(person) {
    const rec = person.currentRecord;
    const esc = UI._esc.bind(UI);
    let html = '';

    html += `<div class="detail-name-block">
      <div class="sp-school-name-label">${esc(rec?.schoolName || '—')}</div>
      <div class="detail-name">${esc(person.name)}</div>
      ${person.kana ? `<div class="detail-kana">${esc(person.kana)}</div>` : ''}
    </div>`;

    if ((rec?.categories || []).length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">カテゴリー</div>
        <div class="detail-tags">
          ${rec.categories.map(c => `<span class="tag-chip sp-detail-cat-chip">${esc(c)}</span>`).join('')}
        </div>
      </div>`;
    }
    if (rec?.position) {
      html += `<div class="detail-section">
        <div class="detail-section-label">役職</div>
        <div class="detail-value">${esc(rec.position)}</div>
      </div>`;
    }
    // 電話番号：学校の共通電話 + 個人の追加電話
    const schoolForDetail = SchoolState.schools.find(s => s.id === rec?.schoolId);
    const schoolPhones  = schoolForDetail?.phones  || [];
    const personPhones  = rec?.phones || [];
    const allPhones = [...schoolPhones, ...personPhones];
    if (allPhones.length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">電話番号</div>
        <ul class="detail-list">
          ${allPhones.map(p => `<li>
            <span class="phone-type-badge">${esc(p.type)}</span>
            <a href="tel:${esc(p.number)}">${esc(p.number)}</a>
          </li>`).join('')}
        </ul>
      </div>`;
    }
    if ((rec?.emails || []).length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">メールアドレス</div>
        <ul class="detail-list">
          ${rec.emails.map(e => `<li><a href="mailto:${esc(e)}">${esc(e)}</a></li>`).join('')}
        </ul>
      </div>`;
    }
    // 住所：学校の共通住所のみ
    const schoolAddresses = schoolForDetail?.addresses || [];
    if (schoolAddresses.length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">住所</div>
        ${schoolAddresses.map(addr => {
          const full = [addr.zipCode ? `〒${addr.zipCode}` : '', addr.address].filter(Boolean).join('　');
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.address || '')}`;
          return `<div class="detail-address-item">
            ${addr.label ? `<span class="address-label-badge">${esc(addr.label)}</span>` : ''}
            <div class="detail-address-row">
              <div class="detail-value">${esc(full)}</div>
              ${addr.address ? `<button class="btn-map" onclick="window.open('${mapUrl}','_blank')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>地図を開く</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }
    if (rec?.notes) {
      html += `<div class="detail-section">
        <div class="detail-section-label">備考</div>
        <div class="detail-value" style="white-space:pre-wrap">${esc(rec.notes)}</div>
      </div>`;
    }
    if ((person.history || []).length) {
      html += `<div class="sp-history-section">
        <button class="sp-history-btn" id="sp-history-toggle">
          過去の学校を見る <span class="toggle-arrow">▼</span>
        </button>
        <div id="sp-history-body" class="sp-history-body">
          ${[...person.history].reverse().map((h, idx) => this._historyRow(h, idx)).join('')}
        </div>
      </div>`;
    }
    return html;
  },

  _historyRow(h, idx) {
    const esc  = UI._esc.bind(UI);
    const from = h.fromDate ? new Date(h.fromDate).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' }) : '';
    const to   = h.toDate   ? new Date(h.toDate).toLocaleDateString('ja-JP',   { year: 'numeric', month: '2-digit' }) : '';
    const cats = (h.categories || []).join('・');
    return `
      <div class="history-entry history-entry--clickable" data-history-idx="${idx}">
        <div class="history-entry-header">
          <div>
            <div class="history-school">${esc(h.schoolName || '—')}</div>
            ${cats ? `<div class="history-cats">${esc(cats)}</div>` : ''}
            ${(from || to) ? `<div class="history-period">${from}〜${to}</div>` : ''}
          </div>
          <span class="history-expand-arrow">›</span>
        </div>
      </div>`;
  },

  _bindHistoryEvents(person, container) {
    container.querySelector('#sp-history-toggle')?.addEventListener('click', () => {
      const body = container.querySelector('#sp-history-body');
      const btn  = container.querySelector('#sp-history-toggle');
      const open = body.classList.toggle('open');
      btn.querySelector('.toggle-arrow').textContent = open ? '▲' : '▼';
    });
    const historyReversed = [...person.history].reverse();
    container.querySelectorAll('.history-entry--clickable').forEach(entry => {
      const idx = parseInt(entry.dataset.historyIdx, 10);
      entry.addEventListener('click', () => {
        SchoolHistoryDetailModal.open(historyReversed[idx], person.name);
      });
    });
  },

  close() {
    document.getElementById('sp-detail-modal').classList.add('hidden');
    document.body.style.overflow = '';
    this._personId = null;
  },

  edit() {
    const id = this._personId;
    this.close();
    SchoolPersonModal.openEdit(id);
  },

  async delete() {
    const person = SchoolState.persons.find(p => p.id === this._personId);
    if (!person) return;
    if (!confirm(`「${person.name}」さんのデータを削除しますか？\n過去の履歴もすべて削除されます。`)) return;
    const btn = document.getElementById('sp-detail-delete');
    btn.disabled = true; btn.textContent = '削除中...';
    try {
      await SchoolDataService.deletePerson(this._personId);
      this.close();
      SchoolView.render();
    } catch (e) {
      console.error('削除エラー:', e);
      alert('削除に失敗しました。');
      btn.disabled = false; btn.textContent = '削除';
    }
  },
};

// -----------------------------------------------
// SchoolHistoryDetailModal — 過去の学校詳細
// -----------------------------------------------
const SchoolHistoryDetailModal = {
  _photoIdx: 0,

  open(h, personName) {
    this._photoIdx = 0;
    const photos = h.photos || [];
    const esc = UI._esc.bind(UI);
    const fmt = d => d ? new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    const from = fmt(h.fromDate);
    const to   = fmt(h.toDate);

    document.getElementById('sp-history-modal-title').textContent = personName;
    const body = document.getElementById('sp-history-modal-body');
    body.innerHTML = `
      <div class="detail-layout">
        <div class="detail-photo-panel">${_SpCarousel.buildPanel(photos)}</div>
        <div class="detail-info-panel">${this._buildInfoPanel(h, esc, from, to)}</div>
      </div>`;
    document.getElementById('sp-history-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (photos.length) _SpCarousel.init(photos, body, this);
  },

  _buildInfoPanel(h, esc, from, to) {
    let html = '';
    html += `<div class="detail-name-block">
      <div class="sp-school-name-label">${esc(h.schoolName || '—')}</div>
      ${(from || to) ? `<div class="detail-kana">${from}&nbsp;〜&nbsp;${to}</div>` : ''}
    </div>`;
    if ((h.categories || []).length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">カテゴリー</div>
        <div class="detail-tags">
          ${h.categories.map(c => `<span class="tag-chip sp-detail-cat-chip">${esc(c)}</span>`).join('')}
        </div>
      </div>`;
    }
    if (h.position) {
      html += `<div class="detail-section">
        <div class="detail-section-label">役職</div>
        <div class="detail-value">${esc(h.position)}</div>
      </div>`;
    }
    if ((h.phones || []).length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">電話番号</div>
        <ul class="detail-list">
          ${h.phones.map(p => `<li>
            <span class="phone-type-badge">${esc(p.type)}</span>
            <a href="tel:${esc(p.number)}">${esc(p.number)}</a>
          </li>`).join('')}
        </ul>
      </div>`;
    }
    if ((h.emails || []).length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">メールアドレス</div>
        <ul class="detail-list">
          ${h.emails.map(e => `<li><a href="mailto:${esc(e)}">${esc(e)}</a></li>`).join('')}
        </ul>
      </div>`;
    }
    if ((h.addresses || []).length) {
      html += `<div class="detail-section">
        <div class="detail-section-label">住所</div>
        ${h.addresses.map(addr => {
          const full = [addr.zipCode ? `〒${addr.zipCode}` : '', addr.address].filter(Boolean).join('　');
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.address || '')}`;
          return `<div class="detail-address-item">
            ${addr.label ? `<span class="address-label-badge">${esc(addr.label)}</span>` : ''}
            <div class="detail-address-row">
              <div class="detail-value">${esc(full)}</div>
              ${addr.address ? `<button class="btn-map" onclick="window.open('${mapUrl}','_blank')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>地図を開く</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }
    if (h.notes) {
      html += `<div class="detail-section">
        <div class="detail-section-label">備考</div>
        <div class="detail-value" style="white-space:pre-wrap">${esc(h.notes)}</div>
      </div>`;
    }
    return html;
  },

  close() {
    document.getElementById('sp-history-modal').classList.add('hidden');
    document.body.style.overflow = '';
  },
};

// -----------------------------------------------
// SchoolAddModal — 学校追加
// -----------------------------------------------
const SchoolAddModal = {
  open() {
    document.getElementById('school-add-name').value = '';
    document.getElementById('school-add-error').textContent = '';
    document.getElementById('school-add-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('school-add-name').focus(), 100);
  },
  close() {
    document.getElementById('school-add-modal').classList.add('hidden');
    document.body.style.overflow = '';
  },
  async submit() {
    const name = document.getElementById('school-add-name').value.trim();
    if (!name) {
      document.getElementById('school-add-error').textContent = '学校名を入力してください';
      return;
    }
    const btn = document.getElementById('school-add-submit');
    btn.disabled = true; btn.textContent = '追加中...';
    try {
      await SchoolDataService.addSchool(name);
      this.close();
      SchoolView.render();
    } catch (e) {
      console.error('追加エラー:', e);
      alert('追加に失敗しました。');
    } finally {
      btn.disabled = false; btn.textContent = '追加';
    }
  },
};

// -----------------------------------------------
// SchoolCsvService — CSV一括取込・テンプレートDL
// -----------------------------------------------
const SchoolCsvService = {
  _pendingRows: [],

  downloadCurrentData() {
    const bom = '﻿';
    const header = '学校名,郵便番号,住所,電話種別1,電話番号1,電話種別2,電話番号2,電話種別3,電話番号3';
    const escCsv = v => {
      const s = String(v || '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = SchoolState.schools
      .filter(s => !s.isSpecial)
      .map(school => {
        const addr = (school.addresses || [])[0] || {};
        const phones = school.phones || [];
        const phoneCols = [];
        for (let i = 0; i < 3; i++) {
          phoneCols.push(phones[i]?.type || '');
          phoneCols.push(phones[i]?.number || '');
        }
        return [school.name, addr.zipCode || '', addr.address || '', ...phoneCols]
          .map(escCsv).join(',');
      });
    const csv = bom + header + '\n' + rows.join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `schools_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  _parseCsv(text) {
    return text.split(/\r?\n/).map(line => {
      const cols = []; let inQ = false; let cur = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    });
  },

  openImportModal() {
    this._pendingRows = [];
    document.getElementById('school-csv-input').value = '';
    document.getElementById('school-csv-preview').innerHTML = '';
    document.getElementById('school-csv-submit').disabled = true;
    document.getElementById('school-csv-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  closeImportModal() {
    document.getElementById('school-csv-modal').classList.add('hidden');
    document.body.style.overflow = '';
  },

  async handleFile(file) {
    const text = await file.text();
    const allRows = this._parseCsv(text).filter(cols => cols.some(c => c));
    const dataRows = allRows.filter(cols =>
      cols[0] && cols[0] !== '学校名' && !cols[0].startsWith('（例）') && !cols[0].startsWith('(例)')
    );
    this._pendingRows = dataRows.map(cols => {
      const phones = [];
      for (let i = 3; i + 1 < cols.length; i += 2) {
        const num = cols[i + 1] || '';
        if (num) phones.push({ id: crypto.randomUUID(), type: cols[i] || '代表', number: num });
      }
      return { name: cols[0] || '', zipCode: cols[1] || '', address: cols[2] || '', phones };
    }).filter(r => r.name);

    const preview = document.getElementById('school-csv-preview');
    if (!this._pendingRows.length) {
      preview.innerHTML = '<span style="color:#ef4444">有効なデータが見つかりませんでした。</span>';
      document.getElementById('school-csv-submit').disabled = true;
    } else {
      const nameMap = {};
      SchoolState.schools.filter(s => !s.isSpecial).forEach(s => { nameMap[s.name] = true; });
      const addCount    = this._pendingRows.filter(r => !nameMap[r.name]).length;
      const updateCount = this._pendingRows.length - addCount;
      const summary = [
        addCount    ? `新規${addCount}校` : '',
        updateCount ? `更新${updateCount}校` : '',
      ].filter(Boolean).join(' / ');
      preview.innerHTML =
        `<span style="color:var(--blue-main)">${this._pendingRows.length}校を処理します（${summary}）:</span><br>` +
        this._pendingRows.slice(0, 5).map(r => {
          const info = [r.address, r.phones.length ? `電話${r.phones.length}件` : ''].filter(Boolean).join(' / ');
          return `・${UI._esc(r.name)}` +
            (info ? `<span style="color:var(--text-muted);font-size:0.8rem"> — ${UI._esc(info)}</span>` : '');
        }).join('<br>') +
        (this._pendingRows.length > 5 ? `<br>… 他${this._pendingRows.length - 5}校` : '');
      document.getElementById('school-csv-submit').disabled = false;
    }
  },

  async importSchools() {
    if (!this._pendingRows.length) return;
    const btn = document.getElementById('school-csv-submit');
    btn.disabled = true; btn.textContent = 'インポート中...';
    try {
      await SchoolDataService.importSchoolContacts(this._pendingRows);
      this.closeImportModal();
      SchoolView.render();
    } catch (e) {
      console.error('インポートエラー:', e);
      alert('インポートに失敗しました。');
    } finally {
      btn.disabled = false; btn.textContent = 'インポート';
    }
  },
};

// -----------------------------------------------
// 学校ビュー全体のイベント初期化（DOMContentLoaded後）
// -----------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  SchoolDrag.setup();

  // 検索
  const schoolSearch = document.getElementById('school-search');
  schoolSearch?.addEventListener('input', () => {
    SchoolState.searchQuery = schoolSearch.value;
    SchoolView.render();
  });

  // 学校情報閲覧モーダル
  document.getElementById('sc-info-close')?.addEventListener('click', () => SchoolInfoModal.close());
  document.getElementById('sc-info-close-btn')?.addEventListener('click', () => SchoolInfoModal.close());
  document.getElementById('sc-info-edit-btn')?.addEventListener('click', () => SchoolInfoModal.edit());
  document.getElementById('sc-info-delete-btn')?.addEventListener('click', () => SchoolInfoModal.delete());
  document.getElementById('sc-info-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolInfoModal.close();
  });

  // 学校連絡先編集モーダル
  document.getElementById('sc-contact-close')?.addEventListener('click', () => SchoolContactModal.close());
  document.getElementById('sc-contact-cancel')?.addEventListener('click', () => SchoolContactModal.close());
  document.getElementById('sc-contact-save')?.addEventListener('click', () => SchoolContactModal.save());
  document.getElementById('sc-contact-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolContactModal.close();
  });
  document.getElementById('sc-contact-add-phone')?.addEventListener('click', () => SchoolContactModal._addPhone());
  document.getElementById('sc-contact-add-address')?.addEventListener('click', () => SchoolContactModal._addAddress());

  // 学校追加ボタン
  document.getElementById('btn-add-school')?.addEventListener('click', () => SchoolAddModal.open());
  // 教員追加ボタン（学校選択ドロップダウンつきフォームを開く）
  document.getElementById('btn-add-person')?.addEventListener('click', () => SchoolPersonModal.openAdd());
  document.getElementById('school-add-close')?.addEventListener('click', () => SchoolAddModal.close());
  document.getElementById('school-add-cancel')?.addEventListener('click', () => SchoolAddModal.close());
  document.getElementById('school-add-submit')?.addEventListener('click', () => SchoolAddModal.submit());
  document.getElementById('school-add-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolAddModal.close();
  });
  document.getElementById('school-add-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); SchoolAddModal.submit(); }
  });

  // CSV
  document.getElementById('btn-school-csv-import')?.addEventListener('click', () => SchoolCsvService.openImportModal());
  document.getElementById('btn-school-csv-export')?.addEventListener('click', () => SchoolCsvService.downloadCurrentData());
  document.getElementById('school-csv-close')?.addEventListener('click', () => SchoolCsvService.closeImportModal());
  document.getElementById('school-csv-cancel')?.addEventListener('click', () => SchoolCsvService.closeImportModal());
  document.getElementById('school-csv-submit')?.addEventListener('click', () => SchoolCsvService.importSchools());
  document.getElementById('school-csv-input')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) SchoolCsvService.handleFile(f);
  });
  document.getElementById('school-csv-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolCsvService.closeImportModal();
  });

  // 学校別フォームモーダル
  document.getElementById('sp-form-close')?.addEventListener('click', () => SchoolPersonModal.close());
  document.getElementById('sp-form-cancel')?.addEventListener('click', () => SchoolPersonModal.close());
  document.getElementById('sp-form-save')?.addEventListener('click', () => SchoolPersonModal.save());
  document.getElementById('sp-form-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolPersonModal.close();
  });
  document.getElementById('sp-btn-add-phone')?.addEventListener('click', () => SchoolPersonModal._addPhone());
  document.getElementById('sp-btn-add-email')?.addEventListener('click', () => SchoolPersonModal._addEmail());
  document.getElementById('sp-btn-add-address')?.addEventListener('click', () => SchoolPersonModal._addAddress());
  document.getElementById('sp-photo-input')?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    if (files.length) { await SchoolPhotoUploader.onFileSelect(files); e.target.value = ''; }
  });

  // 移動確認モーダル
  document.getElementById('sp-move-close')?.addEventListener('click', () => SchoolMoveModal.close());
  document.getElementById('sp-move-cancel')?.addEventListener('click', () => SchoolMoveModal.close());
  document.getElementById('sp-move-confirm')?.addEventListener('click', () => SchoolMoveModal.confirm());
  document.getElementById('sp-move-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolMoveModal.close();
  });

  // 詳細モーダル
  document.getElementById('sp-detail-close')?.addEventListener('click', () => SchoolPersonDetailModal.close());
  document.getElementById('sp-detail-edit')?.addEventListener('click', () => SchoolPersonDetailModal.edit());
  document.getElementById('sp-detail-delete')?.addEventListener('click', () => SchoolPersonDetailModal.delete());
  document.getElementById('sp-detail-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolPersonDetailModal.close();
  });

  // 過去の学校詳細モーダル
  document.getElementById('sp-history-modal-close')?.addEventListener('click', () => SchoolHistoryDetailModal.close());
  document.getElementById('sp-history-modal-close-btn')?.addEventListener('click', () => SchoolHistoryDetailModal.close());
  document.getElementById('sp-history-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) SchoolHistoryDetailModal.close();
  });

  // ESCキー
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('sp-history-modal').classList.contains('hidden'))  { SchoolHistoryDetailModal.close(); return; }
    if (!document.getElementById('sc-contact-modal').classList.contains('hidden'))  { SchoolContactModal.close(); return; }
    if (!document.getElementById('sc-info-modal').classList.contains('hidden'))     { SchoolInfoModal.close(); return; }
    if (!document.getElementById('sp-form-modal').classList.contains('hidden'))     { SchoolPersonModal.close(); return; }
    if (!document.getElementById('sp-move-modal').classList.contains('hidden'))    { SchoolMoveModal.close(); return; }
    if (!document.getElementById('sp-detail-modal').classList.contains('hidden'))  { SchoolPersonDetailModal.close(); return; }
    if (!document.getElementById('school-add-modal').classList.contains('hidden')) { SchoolAddModal.close(); return; }
    if (!document.getElementById('school-csv-modal').classList.contains('hidden')) { SchoolCsvService.closeImportModal(); }
  });
});
