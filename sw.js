/**
 * sw.js — Service Worker
 * 静的ファイル（JS・CSS・Firebase SDK）をキャッシュし、2回目以降の起動を高速化する。
 * バージョンを上げると古いキャッシュが自動削除される。
 */

const CACHE_NAME = 'bizcard-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './js/auth.js',
  './js/cache.js',
  './js/storage.js',
  './js/data.js',
  './js/filter.js',
  './js/ui.js',
  './js/form.js',
  './js/detail.js',
  './js/export.js',
  './js/app.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js',
];

// インストール時にすべての静的ファイルをキャッシュする
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// アクティベート時に古いキャッシュを削除する
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// フェッチ時の戦略:
//   Firebase API (googleapis.com) → ネットワークのみ（名刺データはキャッシュしない）
//   それ以外（静的ファイル）     → キャッシュ優先・なければネットワーク取得してキャッシュ保存
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase API 通信はキャッシュせずスルー
  if (url.hostname.endsWith('googleapis.com') ||
      url.hostname.endsWith('firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // オフライン時はキャッシュを返す
    })
  );
});
