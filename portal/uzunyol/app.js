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
    var left = o.back === false
      ? '<img class="logo" src="icon-192.png" alt="" width="40" height="40">'
      : '<button class="back" data-a="back" aria-label="Geri">‹</button>';
    return '<div class="hd">' + left + '<span class="hd-r">' + (o.right ? esc(o.right) : '') + '</span></div>' +
      '<div class="ttl"><h1>' + esc(o.title) + '</h1><p class="sub">' + (o.sub ? esc(o.sub) : '') + '</p></div>' +
      '<div class="ct" id="ct">' + (o.body || '') + '</div>' +
      '<div class="ft">' + (o.foot || []).join('') + '</div>';
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
  function answerBox(text) {
    var label = G.show ? 'Gizle' : 'Göster';
    return '<div class="card cur ans-card"><div class="row"><span class="lbl">Cevap</span>' +
      '<button class="hide-btn" data-a="toggle">' + label + '</button></div>' +
      (G.show ? '<div class="ans">' + esc(text) + '</div>' : '<div class="ans" aria-hidden="true">•••••</div>') + '</div>';
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
  var screens = {
    home: function () {
      var body = '';
      ['by', 'bk', 's20'].forEach(function (k) {
        var open = S.open === k;
        body += '<div class="pair"><button class="row-b tap" data-a="play" data-v="' + k + '">' + NAMES[k] + '</button>' +
          '<button class="info" data-a="info" data-v="' + k + '" aria-label="' + NAMES[k] + ' hakkında bilgi" aria-expanded="' + open + '">' + (open ? '×' : 'i') + '</button></div>' +
          (open ? '<div class="card"><span class="clue cur">' + DESC[k] + '</span></div>' : '');
      });
      return scr({ back: false, title: 'Uzun Yol Oyunları', sub: 'Bir oyun seç', body: body + SLOGAN, foot: [btn('Oyuncular', 'players', 'ghost')] });
    },

    players: function () {
      var body = players.map(function (p, i) {
        return '<div class="pair"><div class="row-b">' + esc(p) + '</div><button class="x" data-a="delp" data-v="' + i + '" aria-label="' + esc(p) + ' sil">×</button></div>';
      }).join('');
      if (players.length < MAX_PLAYERS) {
        body += '<div class="pair add"><input id="pname" type="text" maxlength="14" placeholder="İsim" autocomplete="off" aria-label="Oyuncu adı">' + btn('Ekle', 'addp', 'ghost') + '</div>';
      }
      var need = S.after && players.length < 2;
      return scr({ title: 'Kimler oynuyor?', sub: 'En fazla ' + MAX_PLAYERS + ' oyuncu', body: body,
        foot: [btn(need ? 'En az 2 oyuncu' : 'Tamam', 'pdone', 'pri', need ? ' disabled' : '')] });
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
      var it = G.item, body = answerBox(it.ans);
      for (var i = 0; i < G.clue; i++) {
        var cur = i === G.clue - 1;
        body += '<div class="card' + (cur ? ' cur' : '') + '"><span class="lbl' + (cur ? ' cur' : '') + '">İpucu ' + (i + 1) + '</span><span class="clue' + (cur ? ' cur' : '') + '">' + esc(it.clues[i]) + '</span></div>';
      }
      return scr({ title: NAMES.bk, sub: it.cat + ' · İpucu ' + G.clue + ' / 5', right: (6 - G.clue) + ' puan', body: body,
        foot: [G.clue < 5 ? btn('Sonraki ipucu', 'nextclue', 'out') : btn('Kimse bilemedi', 'nobody', 'out'), btn('Biri bildi', 'bkwho', 'pri')] });
    },
    bk_who: function () {
      return scr({ title: 'Kim bildi?', sub: 'Bu soru ' + (6 - G.clue) + ' puan', body: nameList('bkwin'), foot: [btn('Kimse bilemedi', 'nobody', 'ghost')] });
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
      var body = answerBox(G.item.ans) +
        '<div class="hero"><div class="num">' + G.n + ' <small>/ ' + S20_TOTAL + '</small></div><div class="cap">şimdi bilen ' + s20Points() + ' puan alır</div></div>';
      return scr({ title: NAMES.s20, sub: G.item.cat, body: body,
        foot: [G.n >= S20_TOTAL ? btn('Kimse bilemedi', 'nobody', 'out') : btn('Soru soruldu', 'asked', 'out'), btn('Biri bildi', 'swho', 'pri')] });
    },
    s_who: function () {
      return scr({ title: 'Kim bildi?', sub: 'Bu soru ' + s20Points() + ' puan', body: nameList('swin'), foot: [btn('Kimse bilemedi', 'nobody', 'ghost')] });
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

  function s20Points() { return Math.max(1, S20_TOTAL - G.n); }

  function render(focusId) {
    app.innerHTML = screens[S.screen]();
    if (focusId) {
      var el = document.getElementById(focusId);
      if (el) el.focus();
    }
    if (S.screen === 'bk_clue' && document.querySelectorAll) {
      var cards = document.querySelectorAll('#ct .card');
      var last = cards[cards.length - 1];
      if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
    }
  }
  function go(name) { S.screen = name; render(); }

  // ---------- oyun akışı ----------
  function startGame(key) {
    G = { key: key, scores: freshScores(), cat: 'Karışık', show: true };
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
    info: function (v) { S.open = S.open === v ? null : v; render(); },
    play: function (v) {
      if (v !== 'by' && players.length < 2) { S.after = v; return go('players'); }
      startGame(v);
    },
    players: function () { S.after = null; go('players'); },
    addp: function () {
      var inp = document.getElementById('pname');
      var name = inp ? inp.value.trim() : '';
      if (name && players.length < MAX_PLAYERS && players.indexOf(name) === -1) {
        players.push(name);
        store.set('ulo_players', players);
      }
      render(players.length < MAX_PLAYERS ? 'pname' : null);
    },
    delp: function (v) { players.splice(+v, 1); store.set('ulo_players', players); render(); },
    pdone: function () {
      var after = S.after; S.after = null;
      if (after && players.length >= 2) startGame(after); else go('home');
    },
    back: function () {
      var ending = ['by_end', 'bk_score', 's_res', 'done', 'home', 'players'].indexOf(S.screen) !== -1;
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
    nextclue: function () { if (G.clue < 5) G.clue++; render(); },
    bkwho: function () { go('bk_who'); },
    bkwin: function (v) {
      var p = players[+v], pts = 6 - G.clue;
      G.scores[p] = (G.scores[p] || 0) + pts;
      G.last = { name: p, pts: pts };
      ping('end_bk');
      go('bk_score');
    },

    sstart: sStart,
    asked: function () { if (G.n < S20_TOTAL) G.n++; render(); },
    swho: function () { go('s_who'); },
    swin: function (v) {
      var p = players[+v], pts = s20Points();
      G.scores[p] = (G.scores[p] || 0) + pts;
      G.last = { name: p, pts: pts };
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
    if (e.key === 'Enter' && e.target && e.target.id === 'pname') actions.addp();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sessiz */ });
    });
  }

  ping('open');
  if (!store.get('ulo_seen_app', false)) { store.set('ulo_seen_app', true); ping('first_open'); }
  render();
})();
