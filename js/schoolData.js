/**
 * schoolData.js
 * 中学校別管理 — Firestoreデータ層 + ステート管理
 */

const SCHOOL_CATEGORIES = ['校長', '管理職', '進路事務担当', '教員'];

const SPECIAL_SCHOOL_IDS = {
  RETIRED:      '__retired__',
  UNREGISTERED: '__unregistered__',
};

const SPECIAL_SCHOOLS = [
  { id: '__retired__',      name: '退職',  isSpecial: true },
  { id: '__unregistered__', name: '登録外', isSpecial: true },
];

const DEFAULT_SCHOOL_NAMES = [
  '横須賀市立追浜中学校', '横須賀市立鷹取中学校', '横須賀市立田浦中学校',
  '横須賀市立坂本中学校', '横須賀市立不入斗中学校', '横須賀市立常葉中学校',
  '横須賀市立公郷中学校', '横須賀市立池上中学校', '横須賀市立衣笠中学校',
  '横須賀市立大矢部中学校', '横須賀市立大津中学校', '横須賀市立馬堀中学校',
  '横須賀市立浦賀中学校', '横須賀市立鴨居中学校', '横須賀市立岩戸中学校',
  '横須賀市立久里浜中学校', '横須賀市立神明中学校', '横須賀市立野比中学校',
  '横須賀市立北下浦中学校', '横須賀市立長沢中学校', '横須賀市立長井中学校',
  '横須賀市立武山中学校', '横須賀市立大楠中学校', '三浦市立三崎中学校',
  '三浦市立南下浦中学校', '三浦市立初声中学校', '逗子市立逗子中学校',
  '逗子市立久木中学校', '逗子市立沼間中学校', '葉山町立葉山中学校',
  '葉山町立南郷中学校', '横浜市立金沢中学校', '横浜市立六浦中学校',
  '横浜市立大道中学校', '横浜市立西柴中学校', '横浜市立富岡中学校',
  '横浜市立富岡東中学校', '横浜市立義務教育学校西金沢学園（本校舎）',
  '横浜市立並木中学校', '横浜市立釜利谷中学校', '横浜市立小田中学校',
  '鎌倉市立第一中学校', '鎌倉市立第二中学校', '鎌倉市立御成中学校',
  '鎌倉市立腰越中学校', '鎌倉市立深沢中学校', '鎌倉市立大船中学校',
  '鎌倉市立玉縄中学校', '鎌倉市立岩瀬中学校', '鎌倉市立手広中学校',
  '横浜国立大学教育学部附属鎌倉中学校', '鎌倉市立由比ガ浜中学校',
];

// ---- アプリ内ステート ----
const SchoolState = {
  schools: [],   // [{id, name, order, isBuiltIn, isSpecial?}]
  persons: [],   // [{id, name, kana, currentRecord, history}]
  searchQuery: '',
  loaded: false,
};

// ---- Firestoreサービス ----
const SchoolDataService = {
  _schoolsCol() {
    const uid = AuthService.getUid();
    if (!uid) throw new Error('ログインしていません');
    return db.collection('users').doc(uid).collection('schoolList');
  },
  _personsCol() {
    const uid = AuthService.getUid();
    if (!uid) throw new Error('ログインしていません');
    return db.collection('users').doc(uid).collection('schoolPersons');
  },

  async load() {
    try { await this._initDefaultSchools(); } catch (e) { console.warn('学校初期化スキップ:', e); }
    const [schoolSnap, personSnap] = await Promise.all([
      this._schoolsCol().orderBy('order').get(),
      this._personsCol().orderBy('updatedAt', 'desc').get(),
    ]);
    SchoolState.schools = [
      ...schoolSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      ...SPECIAL_SCHOOLS,
    ];
    SchoolState.persons = personSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    SchoolState.loaded = true;
  },

  // デフォルト52校を初回のみ一括登録
  async _initDefaultSchools() {
    const snap = await this._schoolsCol().limit(1).get();
    if (!snap.empty) return;
    const now = new Date().toISOString();
    const names = DEFAULT_SCHOOL_NAMES;
    for (let i = 0; i < names.length; i += 400) {
      const batch = db.batch();
      names.slice(i, i + 400).forEach((name, j) => {
        const ref = this._schoolsCol().doc();
        batch.set(ref, { name, order: i + j + 1, isBuiltIn: true, createdAt: now });
      });
      await batch.commit();
    }
  },

  async addSchool(name) {
    const snap = await this._schoolsCol().orderBy('order', 'desc').limit(1).get();
    const maxOrder = snap.empty ? 0 : snap.docs[0].data().order;
    const ref = this._schoolsCol().doc();
    const now = new Date().toISOString();
    const data = { name, order: maxOrder + 1, isBuiltIn: false, createdAt: now };
    await ref.set(data);
    const school = { id: ref.id, ...data };
    const insertIdx = SchoolState.schools.findIndex(s => s.isSpecial);
    if (insertIdx === -1) SchoolState.schools.push(school);
    else SchoolState.schools.splice(insertIdx, 0, school);
    return school;
  },

  async addSchoolsBulk(names) {
    const snap = await this._schoolsCol().orderBy('order', 'desc').limit(1).get();
    let maxOrder = snap.empty ? 0 : snap.docs[0].data().order;
    const now = new Date().toISOString();
    const added = [];
    for (let i = 0; i < names.length; i += 400) {
      const batch = db.batch();
      names.slice(i, i + 400).forEach(name => {
        maxOrder++;
        const ref = this._schoolsCol().doc();
        const data = { name, order: maxOrder, isBuiltIn: false, createdAt: now };
        batch.set(ref, data);
        added.push({ id: ref.id, ...data });
      });
      await batch.commit();
    }
    const insertIdx = SchoolState.schools.findIndex(s => s.isSpecial);
    if (insertIdx === -1) SchoolState.schools.push(...added);
    else SchoolState.schools.splice(insertIdx, 0, ...added);
    return added;
  },

  async addPerson(data) {
    const id = data._preId || crypto.randomUUID();
    const now = new Date().toISOString();
    const photoUrls = await PhotoService.processPhotos(data.photos || [], `sp_${id}`);
    const person = {
      id,
      name: data.name,
      kana: data.kana || '',
      currentRecord: {
        schoolId:   data.schoolId,
        schoolName: data.schoolName,
        categories: data.categories || [],
        position:   data.position || '',
        department: data.department || '',
        phones:     data.phones || [],
        emails:     data.emails || [],
        addresses:  data.addresses || [],
        notes:      data.notes || '',
        photos:     photoUrls,
        fromDate:   now,
        updatedAt:  now,
      },
      history:   [],
      createdAt: now,
      updatedAt: now,
    };
    await this._personsCol().doc(id).set(person);
    SchoolState.persons.unshift(person);
    return person;
  },

  async updatePerson(id, data) {
    const existing = SchoolState.persons.find(p => p.id === id);
    if (!existing) throw new Error('Person not found');
    const now = new Date().toISOString();
    const keptUrls    = (data.photos || []).filter(p => p.startsWith('https://'));
    const removedUrls = (existing.currentRecord?.photos || [])
      .filter(u => u.startsWith('https://') && !keptUrls.includes(u));
    for (const url of removedUrls) await PhotoService.deleteByUrl(url);
    const photoUrls = await PhotoService.processPhotos(data.photos || [], `sp_${id}`);
    const updated = {
      ...existing,
      name: data.name,
      kana: data.kana || '',
      currentRecord: {
        ...existing.currentRecord,
        categories: data.categories || [],
        position:   data.position || '',
        department: data.department || '',
        phones:     data.phones || [],
        emails:     data.emails || [],
        addresses:  data.addresses || [],
        notes:      data.notes || '',
        photos:     photoUrls,
        updatedAt:  now,
      },
      updatedAt: now,
    };
    await this._personsCol().doc(id).set(updated);
    const idx = SchoolState.persons.findIndex(p => p.id === id);
    if (idx !== -1) SchoolState.persons[idx] = updated;
    return updated;
  },

  // 学校移動: 現在の記録をhistoryに退避し、新学校の空レコードを作成
  async movePerson(personId, newSchoolId, newSchoolName) {
    const existing = SchoolState.persons.find(p => p.id === personId);
    if (!existing) throw new Error('Person not found');
    const now = new Date().toISOString();
    const historyEntry = { ...existing.currentRecord, toDate: now };
    const updated = {
      ...existing,
      currentRecord: {
        schoolId:   newSchoolId,
        schoolName: newSchoolName,
        categories: [],
        position:   '',
        department: '',
        phones:     [],
        emails:     [],
        addresses:  [],
        notes:      '',
        photos:     [],
        fromDate:   now,
        updatedAt:  now,
      },
      history:   [...(existing.history || []), historyEntry],
      updatedAt: now,
    };
    await this._personsCol().doc(personId).set(updated);
    const idx = SchoolState.persons.findIndex(p => p.id === personId);
    if (idx !== -1) SchoolState.persons[idx] = updated;
    return updated;
  },

  async deletePerson(personId) {
    const person = SchoolState.persons.find(p => p.id === personId);
    if (person) {
      const allPhotos = [
        ...(person.currentRecord?.photos || []),
        ...(person.history || []).flatMap(h => h.photos || []),
      ].filter(u => u?.startsWith('https://'));
      for (const url of allPhotos) await PhotoService.deleteByUrl(url);
    }
    await this._personsCol().doc(personId).delete();
    SchoolState.persons = SchoolState.persons.filter(p => p.id !== personId);
  },

  async updateSchoolContacts(schoolId, { phones, addresses }) {
    await this._schoolsCol().doc(schoolId).update({ phones, addresses });
    const school = SchoolState.schools.find(s => s.id === schoolId);
    if (school) { school.phones = phones; school.addresses = addresses; }
  },

  async deleteSchool(schoolId) {
    const persons = this.getPersonsForSchool(schoolId);
    for (const person of persons) {
      await this.movePerson(person.id, SPECIAL_SCHOOL_IDS.UNREGISTERED, '登録外');
    }
    await this._schoolsCol().doc(schoolId).delete();
    SchoolState.schools = SchoolState.schools.filter(s => s.id !== schoolId);
  },

  // CSV インポート: 既存校は電話・住所を更新、新規校は追加
  async importSchoolContacts(rows) {
    const now = new Date().toISOString();
    const nameMap = {};
    SchoolState.schools.filter(s => !s.isSpecial).forEach(s => { nameMap[s.name] = s; });

    const snap = await this._schoolsCol().orderBy('order', 'desc').limit(1).get();
    let maxOrder = snap.empty ? 0 : snap.docs[0].data().order;

    const result = { added: 0, updated: 0 };

    for (let i = 0; i < rows.length; i += 400) {
      const batch = db.batch();
      const memUpdates = [];
      rows.slice(i, i + 400).forEach(row => {
        if (!row.name) return;
        const addresses = (row.zipCode || row.address)
          ? [{ label: '', zipCode: row.zipCode || '', address: row.address || '' }]
          : [];
        const phones = row.phones || [];
        const existing = nameMap[row.name];
        if (existing) {
          batch.update(this._schoolsCol().doc(existing.id), { phones, addresses });
          memUpdates.push({ school: existing, phones, addresses });
          result.updated++;
        } else {
          maxOrder++;
          const ref = this._schoolsCol().doc();
          const data = { name: row.name, order: maxOrder, isBuiltIn: false, createdAt: now, phones, addresses };
          batch.set(ref, data);
          const newSchool = { id: ref.id, ...data };
          const insertIdx = SchoolState.schools.findIndex(s => s.isSpecial);
          if (insertIdx === -1) SchoolState.schools.push(newSchool);
          else SchoolState.schools.splice(insertIdx, 0, newSchool);
          nameMap[row.name] = newSchool;
          result.added++;
        }
      });
      await batch.commit();
      memUpdates.forEach(({ school, phones, addresses }) => {
        school.phones = phones; school.addresses = addresses;
      });
    }
    return result;
  },

  getPersonsForSchool(schoolId) {
    return SchoolState.persons.filter(p => p.currentRecord?.schoolId === schoolId);
  },
};
