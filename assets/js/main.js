(function(){
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  // mobile menu
  var btn = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('[data-menu]');
  if (btn && menu) {
    btn.addEventListener('click', function(){
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      menu.classList.toggle('is-open', !open);
      document.body.classList.toggle('menu-open', !open);
    });
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        btn.setAttribute('aria-expanded','false');
        menu.classList.remove('is-open');
        document.body.classList.remove('menu-open');
      });
    });
  }
  // header state on scroll
  var header = document.querySelector('[data-header]');
  function onScroll(){ if (header) header.classList.toggle('is-scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  // year
  document.querySelectorAll('[data-year]').forEach(function(el){ el.textContent = new Date().getFullYear(); });
  // contact form
  var form = document.querySelector('[data-contact-form]');
  if (form) {
    var status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var name = form.elements['name'].value.trim();
      var phone = form.elements['phone'].value.trim();
      var msg = form.elements['message'].value.trim();
      var type = form.elements['project'] ? form.elements['project'].value : '';
      var missing = [];
      if (!name) missing.push('your name');
      if (!/^[+0-9 ()-]{7,}$/.test(phone)) missing.push('a phone number we can call');
      if (!msg) missing.push('a short description of the job');
      if (missing.length) {
        status.textContent = 'Please add ' + missing.join(', ') + '.';
        status.className = 'form-status is-error';
        return;
      }
      var text = 'Hello, I am ' + name + ' (' + phone + ').' + (type ? ' Project: ' + type + '.' : '') + ' ' + msg;
      var wa = form.getAttribute('data-whatsapp');
      if (wa) {
        window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        status.textContent = 'WhatsApp is opening with your message. Press send there to reach us.';
      } else {
        status.textContent = 'Thank you, ' + name + '. We will call you on ' + phone + ' within one working day.';
      }
      status.className = 'form-status is-ok';
      form.reset();
    });
  }
})();

/* ---------- motion layer: menu escape, page shutter, scroll story, cut reveals, before/after, filters ---------- */
(function(){
  'use strict';
  var doc = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function clamp(x, a, b){ return x < a ? a : x > b ? b : x; }

  // Escape closes the mobile menu and returns focus to its button
  var mbtn = document.querySelector('[data-menu-toggle]'), mnav = document.querySelector('[data-menu]');
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && mbtn && mbtn.getAttribute('aria-expanded') === 'true') { mbtn.click(); mbtn.focus(); }
  });

  // Page transitions: hazard shutter drops, then we navigate. The next page lifts it (pure CSS, see head script).
  document.addEventListener('click', function(e){
    if (reduce || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    var url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (!/(\.html|\/)$/.test(url.pathname)) return;
    e.preventDefault();
    try { sessionStorage.setItem('sk-wipe', '1'); } catch (_) {}
    doc.classList.remove('wipe-in');
    doc.classList.add('is-leaving');
    setTimeout(function(){ location.href = url.href; }, 360);
  });
  window.addEventListener('pageshow', function(e){ if (e.persisted) doc.classList.remove('is-leaving'); });

  // Scroll story (home): pinned 3D stage, steps drive camera + phase
  var story = document.querySelector('[data-story]');
  if (story) {
    var steps = story.querySelectorAll('[data-step]');
    var stage = story.querySelector('[data-story-stage]');
    var hudNum = story.querySelector('[data-hud-num]'), hudLabel = story.querySelector('[data-hud-label]');
    var rail = story.querySelectorAll('[data-hud-rail] li');
    var bar = story.querySelector('[data-hud-bar]');
    var S = window.SanraksStory = { ready: false, p: 0, active: 0, local: [] };
    var lastActive = -1, ticking = false;
    function measure(){
      ticking = false;
      var top = stage.getBoundingClientRect().top;
      var stageTop = parseFloat(getComputedStyle(stage).top) || 0;
      var sh = stage.offsetHeight || window.innerHeight;
      var rect = story.getBoundingClientRect();
      var p = clamp((stageTop - rect.top) / sh, 0, steps.length - 1);
      S.p = p; S.active = Math.round(p);
      for (var i = 0; i < steps.length; i++) S.local[i] = clamp(p - (i - .5), 0, 1);
      S.ready = true;
      if (bar) bar.style.transform = 'scaleY(' + (p / (steps.length - 1)).toFixed(4) + ')';
      if (S.active !== lastActive) {
        lastActive = S.active;
        story.setAttribute('data-phase', S.active);
        steps.forEach(function(s, i){ s.classList.toggle('is-active', i === S.active); });
        rail.forEach(function(li, i){ li.classList.toggle('is-on', i === S.active); li.classList.toggle('is-done', i < S.active); });
        var st = steps[S.active];
        if (hudNum) hudNum.textContent = st.getAttribute('data-num') || '';
        if (hudLabel) hudLabel.textContent = st.getAttribute('data-label') || '';
        if (stage) { stage.classList.remove('cut'); void stage.offsetWidth; stage.classList.add('cut'); }
      }
      void top;
    }
    function req(){ if (!ticking) { ticking = true; requestAnimationFrame(measure); } }
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    doc.classList.add('story-ready');
    measure();
  }

  // Hard-cut reveals on section headings (one motif: a slab wipes off the type)
  var cuts = document.querySelectorAll('[data-cut]');
  if (cuts.length && 'IntersectionObserver' in window && !reduce) {
    doc.classList.add('cuts-ready');
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -12% 0px' });
    cuts.forEach(function(c){ io.observe(c); });
  }

  // Before / after wipes
  document.querySelectorAll('[data-ba]').forEach(function(fig){
    var range = fig.querySelector('input[type="range"]');
    function set(v){ v = clamp(v, 0, 100); fig.style.setProperty('--pos', v + '%'); if (range && +range.value !== Math.round(v)) range.value = Math.round(v); }
    if (range) range.addEventListener('input', function(){ set(+range.value); });
    var dragging = false, sx = 0, sy = 0, decided = false;
    function fromEvent(e){ var r = fig.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; }
    fig.addEventListener('pointerdown', function(e){
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; decided = e.pointerType === 'mouse'; sx = e.clientX; sy = e.clientY;
      if (decided) { set(fromEvent(e)); try { fig.setPointerCapture(e.pointerId); } catch (_) {} }
    });
    fig.addEventListener('pointermove', function(e){
      if (!dragging) return;
      if (!decided) {
        var dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
        if (dx < 6 && dy < 6) return;
        if (dy > dx) { dragging = false; return; }
        decided = true; try { fig.setPointerCapture(e.pointerId); } catch (_) {}
      }
      set(fromEvent(e));
    });
    function end(){ dragging = false; }
    fig.addEventListener('pointerup', function(e){ if (dragging && !decided) set(fromEvent(e)); end(); });
    fig.addEventListener('pointercancel', end);
    fig.addEventListener('mouseenter', function(){ fig.classList.add('is-hover'); });
    fig.addEventListener('mouseleave', function(){ fig.classList.remove('is-hover'); });
  });

  // Job filters
  var filters = document.querySelectorAll('[data-filter]');
  if (filters.length) {
    var cases = document.querySelectorAll('[data-kind]');
    var live = document.querySelector('[data-filter-status]');
    filters.forEach(function(b){
      b.addEventListener('click', function(){
        var k = b.getAttribute('data-filter'), n = 0;
        filters.forEach(function(o){ o.setAttribute('aria-pressed', String(o === b)); });
        cases.forEach(function(c){ var show = k === 'all' || c.getAttribute('data-kind') === k; c.hidden = !show; if (show) n++; });
        if (live) live.textContent = 'Showing ' + n + (k === 'all' ? ' jobs' : (k === 'down' ? ' demolition jobs' : ' painting jobs'));
      });
    });
  }
})();
