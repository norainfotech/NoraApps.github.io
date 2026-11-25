(function () {
  'use strict';

  var C = window.CONTENT;
  var app = document.getElementById('app');
  var MAX_PLAYERS = 5;
  var ROUND_SIZE = 10;
  var S20_TOTAL = 20;
  var BK_CATS = ['Kim', 'Ne', 'Şehir', 'Ülke', 'Hayvan', 'Karışık'];
  var S20_CATS = ['Hayvan', 'Eşya', 'Yiyecek', 'Meslek', 'Yer', 'Karışık'];
  var LETTERS = ['A', 'B', 'C', 'D'];
  var DESC = {
    by: 'Soruyu oku, şıklardan birini seç. Araba tek takım olarak puan toplar.',
    bk: 'İpuçları zordan kolaya gelir. Cevabı ne kadar erken bilen o kadar çok puan alır.',
    s20: 'Telefonu tutan cevabı ekrandan görür. Diğerleri sırayla evet/hayır soruları sorar. Cevabı erken bilen daha çok puan alır.'
  };
  var NAMES = { by: 'Bilgi Yarışması', bk: 'Ben Kimim?', s20: '20 Soru' };

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sessiz */ }
    }
  };

  var SB_URL = 'https://gjztdlihsfmozxcgdwke.supabase.co/rest/v1/rpc/ulo_count';
  var SB_KEY = 'sb_publishable_tDQAKMpHaorQAplXqg5Nqg_zwOImZeT';
  function ping(ev) {
    try {
      fetch(SB_URL, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
        body: JSON.stringify({ p_event: ev })
      }).catch(function () {});
    } catch (e) { /* sessiz */ }
  }

  var players = store.get('ulo_players', []);
  var seen = store.get('ulo_seen', { by: [], bk: [], s20: [] });
  var S = { screen: 'home', open: null, after: null };
  var G = null;
  var totals = store.get('ulo_totals', {});
  function addTotal(name, key, pts) {
    if (!totals[name]) totals[name] = { bk: 0, s20: 0 };
    totals[name][key] = (totals[name][key] || 0) + pts;
    store.set('ulo_totals', totals);
  }
  var wakeLock = null;

  // ---------- yardımcılar ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = r[i]; r[i] = r[j]; r[j] = t;
    }
    return r;
  }
  function saveSeen() { store.set('ulo_seen', seen); }
  function markSeen(key, id) {
    if (seen[key].indexOf(id) === -1) { seen[key].push(id); saveSeen(); }
  }
  function unseen(key, filter) {
    return C[key].filter(function (x) {
      return seen[key].indexOf(x.id) === -1 && (!filter || filter(x));
    });
  }
  function freshScores() {
    var s = {};
    players.forEach(function (p) { s[p] = 0; });
    return s;
  }
  function ranked(onlyScored) {
    var list = players.map(function (p) { return { n: p, v: G.scores[p] || 0 }; });
    if (onlyScored) list = list.filter(function (x) { return x.v > 0; });
    list.sort(function (a, b) { return b.v - a.v; });
    return list;
  }
  function lock() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }, function () {});
      }
    } catch (e) { /* sessiz */ }
  }
  function unlock() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { /* sessiz */ }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && G) lock();
  });

  // ---------- parçalar ----------
  // ---------- ortak iskelet: her ekran bunu kullanır ----------
  // o: { title, sub, right, back(false=logo), body, foot:[html,...] }  foot sırası: ikincil..., ana (en altta)
  function scr(o) {
    var hd, mid;
    if (o.home) {
      hd = '<div class="hd"><span class="brand big"><img class="logo" src="icon-192.png" alt="" width="48" height="48"><span>Uzun Yol Oyunları</span></span><button class="hd-btn" data-a="share" aria-label="Paylaş"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/></svg></button></div>';
      mid = '<div class="slogan-wrap">' + SLOGAN + '</div>';
    } else {
      hd = '<div class="hd"><button class="back" data-a="back" aria-label="Geri">‹</button>' +
        '<span class="brand"><img class="logo" src="icon-192.png" alt="" width="28" height="28"><span>Uzun Yol Oyunları</span></span>' +
        '<span class="hd-r">' + (o.right ? esc(o.right) : '') + '</span></div>';
      mid = '<div class="ttl"><h1>' + esc(o.title) + '</h1><p class="sub">' + (o.sub ? esc(o.sub) : '') + '</p></div>';
    }
    var ct = o.pin
      ? '<div class="ct has-pin" id="ct"><div class="mid"><div class="in">' + (o.body || '') + '</div></div><div class="pin">' + o.pin + '</div></div>'
      : '<div class="ct" id="ct"><div class="in' + (o.top ? ' top' : '') + '">' + (o.body || '') + '</div></div>';
    return hd + mid + ct + '<div class="ft">' + (o.foot || []).join('') + '</div>';
  }
  function btn(label, action, kind, extra) {
    return '<button class="btn ' + (kind || '') + '" data-a="' + action + '"' + (extra || '') + '>' + label + '</button>';
  }
  function nameList(action) {
    return players.map(function (p, i) {
      return '<button class="row-b tap" data-a="' + action + '" data-v="' + i + '">' + esc(p) + '</button>';
    }).join('');
  }
  function board(onlyScored, hiName) {
    var rows = ranked(onlyScored).map(function (x, i) {
      return '<div class="srow' + (x.n === hiName || (hiName === true && i === 0) ? ' hi' : '') + '"><span>' + esc(x.n) + '</span><span>' + x.v + '</span></div>';
    }).join('');
    return rows ? '<div class="card">' + rows + '</div>' : '';
  }
  function catGrid(cats, sel) {
    return '<div class="grid">' + cats.map(function (c) {
      return '<button class="cat' + (c === sel ? ' sel' : '') + '" data-a="cat" data-v="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('') + '</div>';
  }
  var EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
  function turnRow() {
    return '<div class="turn"><span class="t-l">Tahmin sırası</span><span class="t-n">' + esc(players[G.turn % players.length]) + '</span></div>';
  }
  function answerBox(text) {
    return '<div class="pin-in">' + turnRow() + '<div class="ans-chip"><span class="lbl">Cevap</span>' +
      (G.show ? '<span class="ans">' + esc(text) + '</span>' : '<span class="ans" aria-hidden="true">\u2022\u2022\u2022\u2022\u2022</span>') +
      '<button class="eye" data-a="toggle" aria-label="' + (G.show ? 'Cevabı gizle' : 'Cevabı göster') + '">' + (G.show ? EYE_OFF : EYE) + '</button></div></div>';
  }
  function counter() {
    var r = S20_TOTAL - G.n, p = Math.round(r / S20_TOTAL * 100);
    return '<div class="hero big"><button class="ring" data-a="asked" aria-label="Soru soruldu, kalan hakkı azalt" style="--p:' + p + '">' +
      '<span class="ring-in"><span class="num">' + r + '</span><span class="of">kalan soru hakkı</span></span><span class="plus">\u2212</span></button>' +
      '<div class="cap">şimdi bilen ' + s20Points() + ' puan alır</div></div>';
  }
  function heroPts() {
    return G.last
      ? '<div class="hero"><div class="num acc">+' + G.last.pts + '</div><div class="cap">puan</div></div>'
      : '<div class="hero"><div class="cap">Kimse bilemedi</div><div class="ans">' + esc(G.item.ans) + '</div></div>';
  }
  function doneScreen() {
    return scr({ title: 'Sorular bitti', sub: 'Bu oyundaki bütün içerik oynandı',
      foot: [btn('Ana ekran', 'home', 'ghost'), btn('Baştan başla', 'reset', 'pri')] });
  }


  // Ana ekran sloganı: "oyun bitmez" renkli yol şeridinin üstünde; açılışta bir kez çizilir
  var SLOGAN = '<div class="slogan" aria-label="Yol biter, oyun bitmez">' +
    '<svg viewBox="0 0 350 150" role="img" aria-hidden="true">' +
    '<g transform="rotate(-3 175 75)">' +
      '<text class="sl-t1" x="10" y="38" font-size="30">Yol biter,</text>' +
      '<g class="sl-sp"><path d="M262 16 l9 -10 M276 24 l12 -6 M254 28 l3 -13"/></g>' +
      '<rect class="sl-pill" x="6" y="52" width="338" height="58" rx="29"/>' +
      '<text class="sl-t2" x="175" y="93" font-size="34" text-anchor="middle">oyun bitmez</text>' +
      '<path class="sl-road" d="M20 134 Q175 122 330 130"/>' +
      '<path class="sl-dash" d="M20 134 Q175 122 330 130"/>' +
    '</g></svg></div>';

  // ---------- ekranlar ----------
  var ICONS = {'by': '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 6a12 12 0 0 0-6 22.4V34h12v-5.6A12 12 0 0 0 24 6z"/><path d="M19 40h10M21 44h6"/></svg>', 'bk': '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="24" cy="16" r="8"/><path d="M8 43c2-10 8-14 16-14s14 4 16 14"/></svg>', 's20': '<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9h32v23H21l-9 8v-8H8z"/><path d="M17 20h14"/></svg>'};
  var TAGS = { by: 'Tek takım', bk: '5 ipucu', s20: '20 soruda bul' };

  var screens = {
    home: function () {
      var body = '<div class="gal">' + ['by', 'bk', 's20'].map(function (k) {
        return '<div class="gcard c-' + k + '"><button class="g-main" data-a="play" data-v="' + k + '">' + ICONS[k] +
          '<span class="g-name">' + NAMES[k] + '</span><span class="g-tag">' + TAGS[k] + '</span></button>' +
          '<button class="g-i" data-a="info" data-v="' + k + '" aria-label="' + NAMES[k] + ' hakkında bilgi">i</button></div>';
      }).join('') + '</div>';
      return scr({ home: true, body: body, foot: [btn('Puan tablosu', 'board', 'gold')] });
    },

    players: function () {
      var body = players.map(function (p, i) {
        return '<div class="pair"><div class="row-b">' + esc(p) + '</div><button class="x" data-a="delp" data-v="' + i + '" aria-label="' + esc(p) + ' sil">×</button></div>';
      }).join('');
      if (players.length < MAX_PLAYERS) {
        body += S.adding
          ? '<div class="pair add"><input id="pname" type="text" maxlength="14" placeholder="İsim" autocomplete="off" aria-label="Oyuncu adı">' + btn('Tamam', 'okp', 'pri') + '</div>'
          : btn('+ Oyuncu ekle', 'addp', 'out');
      }
      var need = players.length < 2;
      return scr({ title: 'Kimler oynuyor?', sub: (S.after ? NAMES[S.after] + ' · ' : '') + 'en az 2, en fazla ' + MAX_PLAYERS + ' oyuncu', top: true, body: body,
        foot: [btn(need ? 'En az 2 oyuncu' : (S.after ? 'Başla' : 'Tamam'), 'pdone', 'pri', need ? ' disabled' : '')] });
    },

    totals: function () {
      var rows = Object.keys(totals).map(function (n) { var t = totals[n]; return { n: n, bk: t.bk || 0, s20: t.s20 || 0 }; })
        .filter(function (x) { return x.bk + x.s20 > 0; })
        .sort(function (a, b) { return (b.bk + b.s20) - (a.bk + a.s20); });
      var body = rows.length ? rows.map(function (x) {
        return '<div class="card tot"><div class="srow"><span>' + esc(x.n) + '</span><span>' + (x.bk + x.s20) + '</span></div>' +
          '<div class="tsub"><span>Ben Kimim? ' + x.bk + '</span><span>20 Soru ' + x.s20 + '</span></div></div>';
      }).join('') : '<div class="empty">Henüz puan yok.<br>Ben Kimim? ve 20 Soru\'da kazanılan puanlar burada birikir.</div>';
      return scr({ title: 'Puan tablosu', sub: 'Bu telefonda kazanılanlar', body: body,
        top: rows.length > 0, foot: rows.length ? [btn('Puanları sıfırla', 'askreset', 'none'), btn('Puanları paylaş', 'shareboard', 'pri')] : [] });
    },

    // --- Bilgi Yarışması ---
    by_q: function () {
      var q = G.cur, wrong = G.state === 'wrong', right = G.state === 'right', done = wrong || right;
      var body = '<div class="q">' + esc(q.q) + '</div>';
      body += G.opts.map(function (o, i) {
        var cls = 'opt', tag = '';
        if (done) {
          cls += (i === G.chosen ? (right ? ' ok' : ' bad') : ' dim');
          if (i === G.chosen) tag = '<span class="g">' + (right ? 'Doğru' : 'Yanlış') + '</span>';
        }
        return '<button class="' + cls + '" data-a="opt" data-v="' + i + '"' + (done ? ' disabled' : '') + '><span class="l">' + LETTERS[i] + '</span><span class="t">' + esc(o) + '</span>' + tag + '</button>';
      }).join('');
      return scr({ title: NAMES.by, sub: q.cat, right: (G.i + 1) + ' / ' + G.round.length, body: body,
        foot: [btn(G.i + 1 >= G.round.length ? 'Bitir' : 'Sonraki soru', 'bynext', 'pri', done ? '' : ' disabled')] });
    },
    by_end: function () {
      var body = '<div class="hero"><div class="num acc">' + G.score + ' <small>/ ' + G.round.length + '</small></div><div class="cap">doğru cevap</div></div>';
      return scr({ title: 'Tur bitti', sub: NAMES.by, body: body, foot: [btn('Ana ekran', 'home', 'ghost'), btn('Yeni tur', 'byround', 'pri')] });
    },

    // --- Ben Kimim ---
    bk_cat: function () {
      return scr({ title: 'Kategori', sub: NAMES.bk, body: catGrid(BK_CATS, G.cat), foot: [btn('Başla', 'bkstart', 'pri')] });
    },
    bk_clue: function () {
      var it = G.item, body = '';
      for (var i = 0; i < G.clue; i++) {
        var cur = i === G.clue - 1;
        body += '<div class="card' + (cur ? ' cur' : '') + '"><span class="lbl' + (cur ? ' cur' : '') + '">İpucu ' + (i + 1) + '</span><span class="clue' + (cur ? ' cur' : '') + '">' + esc(it.clues[i]) + '</span></div>';
      }
      return scr({ title: NAMES.bk, sub: it.cat + ' · İpucu ' + G.clue + ' / 5', right: (6 - G.clue) + ' puan', pin: answerBox(it.ans), body: body,
        foot: [G.clue < 5 ? btn('Sonraki ipucu', 'nextclue', 'out') : btn('Kimse bilemedi', 'nobody', 'none'), btn('Biri bildi', 'bkwho', 'pri')] });
    },
    bk_who: function () {
      return scr({ title: 'Kim bildi?', sub: 'Bu soru ' + (6 - G.clue) + ' puan', body: nameList('bkwin') });
    },
    bk_score: function () {
      return scr({ title: 'Puan durumu', sub: NAMES.bk, body: heroPts() + board(true, G.last && G.last.name),
        foot: [btn('Ana ekran', 'home', 'ghost'), btn('Sonraki', 'bkstart', 'pri')] });
    },

    // --- 20 Soru ---
    s_cat: function () {
      return scr({ title: 'Kategori', sub: NAMES.s20, body: catGrid(S20_CATS, G.cat), foot: [btn('Başla', 'sstart', 'pri')] });
    },
    s_ref: function () {
      return scr({ title: NAMES.s20, sub: G.item.cat, pin: answerBox(G.item.ans), body: counter(),
        foot: [btn('Biri bildi', 'swho', 'pri')] });
    },
    s_who: function () {
      return scr({ title: 'Kim bildi?', sub: 'Bu soru ' + s20Points() + ' puan', body: nameList('swin') });
    },
    s_res: function () {
      return scr({ title: 'Puan durumu', sub: NAMES.s20, body: heroPts() + board(true, G.last && G.last.name),
        foot: [btn('Ana ekran', 'home', 'ghost'), btn('Sonraki', 'sstart', 'pri')] });
    },

    done: doneScreen
  };

  function askExit() {
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h2>Oyundan çıkılsın mı?</h2>' +
      btn('Çık', 'xleave', 'ghost') + btn('Devam et', 'xstay', 'pri') + '</div>';
    m.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      e.stopPropagation();
      document.body.removeChild(m);
      if (b.getAttribute('data-a') === 'xleave') leave();
    });
    document.body.appendChild(m);
  }

  function showInfo(k) {
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h2>' + NAMES[k] + '</h2><p class="clue cur">' + DESC[k] + '</p>' + btn('Tamam', 'xstay', 'pri') + '</div>';
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('button')) { e.stopPropagation(); document.body.removeChild(m); }
    });
    document.body.appendChild(m);
  }

  function s20Points() { return Math.max(1, S20_TOTAL - G.n); }

  function render(focusId) {
    app.innerHTML = screens[S.screen]();
    if (focusId) {
      var el = document.getElementById(focusId);
      if (el) el.focus();
    }
    if (S.screen === 'bk_clue' && document.querySelectorAll) {
      var cards = document.querySelectorAll('#ct .mid .card');
      var last = cards[cards.length - 1];
      if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
    }
  }
  function go(name) { S.screen = name; render(); }

  // ---------- oyun akışı ----------
  function startGame(key) {
    G = { key: key, scores: freshScores(), cat: 'Karışık', show: true, turn: 0 };
    ping('start_' + key);
    lock();
    if (key === 'by') startRound();
    else go(key === 'bk' ? 'bk_cat' : 's_cat');
  }
  function startRound() {
    var pool = unseen('by');
    if (!pool.length) return go('done');
    G.score = 0;
    G.round = shuffle(pool).slice(0, ROUND_SIZE);
    G.i = -1;
    byNext();
  }
  function byNext() {
    G.i++;
    if (G.i >= G.round.length) { ping('end_by'); return go('by_end'); }
    var q = G.round[G.i];
    G.cur = q;
    G.opts = shuffle([q.ok].concat(q.wrong));
    G.state = 'ask';
    G.chosen = null;
    markSeen('by', q.id);
    go('by_q');
  }
  function pickItem(key) {
    var pool = unseen(key, function (x) { return G.cat === 'Karışık' || x.cat === G.cat; });
    if (!pool.length) return null;
    var it = pool[Math.floor(Math.random() * pool.length)];
    markSeen(key, it.id);
    return it;
  }
  function bkStart() {
    var it = pickItem('bk');
    if (!it) return go('done');
    G.item = it; G.clue = 1; G.show = true; G.last = null;
    go('bk_clue');
  }
  function sStart() {
    var it = pickItem('s20');
    if (!it) return go('done');
    G.item = it; G.n = 0; G.show = true; G.last = null;
    go('s_ref');
  }
  function leave() {
    G = null; S.open = null; S.after = null;
    unlock();
    go('home');
  }

  // ---------- olaylar ----------
  var actions = {
    info: function (v) { showInfo(v); },
    play: function (v) {
      if (v !== 'by') { S.after = v; S.adding = players.length === 0; return go('players'); }
      startGame(v);
    },
    addp: function () { S.adding = true; render('pname'); },
    okp: function () {
      var inp = document.getElementById('pname');
      var name = inp ? inp.value.trim() : '';
      if (name && players.length < MAX_PLAYERS && players.indexOf(name) === -1) {
        players.push(name);
        store.set('ulo_players', players);
      }
      S.adding = false;
      render();
    },
    board: function () { go('totals'); },
    share: function () { shareOut('Arabada oynayacağımız oyunlar: Uzun Yol Oyunları'); },
    shareboard: function () { shareOut(boardText()); },
    askreset: function () {
      var m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h2>Puanlar silinsin mi?</h2><p class="clue cur">Bu telefondaki tüm puanlar sıfırlanır.</p>' + btn('Sil', 'xdel', 'none') + btn('Vazgeç', 'xstay', 'pri') + '</div>';
      m.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        e.stopPropagation();
        document.body.removeChild(m);
        if (b.getAttribute('data-a') === 'xdel') { totals = {}; store.set('ulo_totals', totals); render(); }
      });
      document.body.appendChild(m);
    },
    delp: function (v) { players.splice(+v, 1); store.set('ulo_players', players); render(); },
    pdone: function () {
      var after = S.after; S.after = null;
      if (after && players.length >= 2) startGame(after); else go('home');
    },
    back: function () {
      if (S.screen === 'bk_who') return go('bk_clue');
      if (S.screen === 's_who') return go('s_ref');
      var ending = ['by_end', 'bk_score', 's_res', 'done', 'home', 'players', 'totals'].indexOf(S.screen) !== -1;
      if (G && !ending) return askExit();
      leave();
    },
    home: leave,
    reset: function () {
      var key = G && G.key;
      if (!key) return leave();
      seen[key] = []; saveSeen();
      if (key === 'by') startRound(); else if (key === 'bk') bkStart(); else sStart();
    },
    toggle: function () { G.show = !G.show; render(); },
    cat: function (v) { G.cat = v; render(); },

    opt: function (v) {
      var i = +v;
      G.chosen = i;
      if (G.opts[i] === G.cur.ok) { G.state = 'right'; G.score++; } else { G.state = 'wrong'; }
      render();
    },
    bynext: byNext,
    byround: startRound,

    bkstart: bkStart,
    nextclue: function () { if (G.clue < 5) { G.clue++; G.turn++; } render(); },
    bkwho: function () { go('bk_who'); },
    bkwin: function (v) {
      var p = players[+v], pts = 6 - G.clue;
      G.scores[p] = (G.scores[p] || 0) + pts;
      G.last = { name: p, pts: pts };
      addTotal(p, 'bk', pts);
      ping('end_bk');
      go('bk_score');
    },

    sstart: sStart,
    asked: function () { G.n++; G.turn++; if (G.n >= S20_TOTAL) return actions.nobody(); render(); },
    swho: function () { go('s_who'); },
    swin: function (v) {
      var p = players[+v], pts = s20Points();
      G.scores[p] = (G.scores[p] || 0) + pts;
      G.last = { name: p, pts: pts };
      addTotal(p, 's20', pts);
      ping('end_s20');
      go('s_res');
    },

    nobody: function () {
      G.last = null;
      ping('end_' + G.key);
      go(G.key === 'bk' ? 'bk_score' : 's_res');
    }
  };

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-a]');
    if (!t || t.disabled) return;
    var a = actions[t.getAttribute('data-a')];
    if (a) a(t.getAttribute('data-v'));
  });
  app.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'pname') actions.okp();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sessiz */ });
    });
  }

  // ---------- paylaşım ----------
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }
  function shareOut(text) {
    var url = location.origin + '/';
    if (navigator.share) {
      navigator.share({ title: 'Uzun Yol Oyunları', text: text, url: url }).catch(function () { /* vazgeçti */ });
      return;
    }
    var full = text + ' ' + url;
    try {
      navigator.clipboard.writeText(full).then(function () { toast('Kopyalandı'); }, function () { toast(url); });
    } catch (e) { toast(url); }
  }
  function boardText() {
    var rows = Object.keys(totals).map(function (n) { var t = totals[n]; return { n: n, v: (t.bk || 0) + (t.s20 || 0) }; })
      .filter(function (x) { return x.v > 0; })
      .sort(function (a, b) { return b.v - a.v; });
    return 'Uzun Yol Oyunları puan tablosu:\n' + rows.map(function (x, i) { return (i + 1) + '. ' + x.n + ' - ' + x.v; }).join('\n') + '\nSen de oyna:';
  }

  // ---------- ana ekrana ekleme daveti ----------
  var deferredInstall = null;
  var INVITE_GAP = 7 * 24 * 3600 * 1000;
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent || ''); }
  function maybeInvite() {
    if (isStandalone() || S.screen !== 'home' || document.querySelector('.modal')) return;
    if (!(deferredInstall || isIOS())) return;
    var last = store.get('ulo_invite', 0);
    if (last && Date.now() - last < INVITE_GAP) return;
    showInvite();
  }
  function showInvite() {
    var m = document.createElement('div');
    m.className = 'modal';
    var box = '<div class="box" role="dialog" aria-modal="true"><h2>Kolay kullanım için ana ekrana ekle</h2>' +
      '<p class="clue cur">Tek dokunuşla açılır, internet olmadan da çalışır.</p>' +
      btn('Ana ekrana ekle', 'inst', 'pri') + btn('Daha sonra', 'later', 'ghost') + '</div>';
    m.innerHTML = box;
    m.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'later') { store.set('ulo_invite', Date.now()); document.body.removeChild(m); }
      else if (a === 'inst') {
        if (deferredInstall) {
          var d = deferredInstall; deferredInstall = null;
          document.body.removeChild(m);
          try { d.prompt(); } catch (err) { /* sessiz */ }
        } else {
          m.querySelector('.box').innerHTML = '<h2>Ana ekrana ekle</h2>' +
            '<p class="clue cur">1. Safari\'de alttaki Paylaş simgesine dokun.<br>2. "Ana Ekrana Ekle"yi seç.<br>3. Sağ üstte "Ekle"ye dokun.</p>' +
            btn('Tamam', 'later', 'pri');
        }
      }
    });
    document.body.appendChild(m);
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; setTimeout(maybeInvite, 1200); });
  window.addEventListener('appinstalled', function () { store.set('ulo_invite', Date.now() * 10); });

  ping('open');
  if (!store.get('ulo_seen_app', false)) { store.set('ulo_seen_app', true); ping('first_open'); }
  render();
  setTimeout(maybeInvite, 1800);
})();
