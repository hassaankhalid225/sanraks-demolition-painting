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
