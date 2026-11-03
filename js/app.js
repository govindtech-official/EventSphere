/* =========================================================
   EventSphere – Application logic
   Sections: storage · helpers · theme · navbar · rendering ·
             filters · modal · countdown · form validation ·
             bookings · scroll effects · init
   ========================================================= */

(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const STORAGE_KEY = 'es-registrations';
  const THEME_KEY = 'es-theme';

  const state = {
    category: 'All',
    search: '',
    sort: 'date'
  };

  /* ---------- Local Storage (wrapped: storage may be blocked) ---------- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* ignore – app still works for this session */ }
    }
  };

  let registrations = store.get(STORAGE_KEY, []);

  /* ---------- Helpers ---------- */
  const escapeHTML = (str) => String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const formatPrice = (p) => (p === 0 ? 'Free' : '₹' + p.toLocaleString('en-IN'));

  const formatDate = (iso, opts) => new Date(iso).toLocaleDateString('en-IN', opts || {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });

  const formatTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  const getEvent = (id) => EVENTS.find((e) => e.id === id);

  const bookedSeats = (id) => registrations
    .filter((r) => r.eventId === id)
    .reduce((sum, r) => sum + r.tickets, 0);

  const seatsLeft = (ev) => Math.max(ev.seats - bookedSeats(ev.id), 0);

  const isPast = (ev) => new Date(ev.date) < new Date();

  // Image with emoji/gradient fallback if the remote image fails to load
  const imageHTML = (ev, extra = '') => `
    <div class="img-wrap ${extra}">
      <span class="fallback" aria-hidden="true">${ev.emoji}</span>
      <img src="${ev.image}" alt="${escapeHTML(ev.name)}" loading="lazy" onerror="this.classList.add('failed')">
    </div>`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  /* ---------- Theme (dark / light) ---------- */
  function initTheme() {
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      toast(next === 'dark' ? '🌙 Dark mode on' : '☀️ Light mode on');
    });
  }

  /* ---------- Navbar ---------- */
  function initNavbar() {
    const hamburger = $('#hamburger');
    const links = $('#navLinks');

    const closeMenu = () => {
      links.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    };

    hamburger.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      hamburger.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
    });

    $$('a', links).forEach((a) => a.addEventListener('click', closeMenu));

    // Highlight the nav link for the section in view
    const sections = $$('main section[id]');
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          $$('a', links).forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  /* ---------- Event cards ---------- */
  function cardHTML(ev, index = 0) {
    const d = new Date(ev.date);
    const left = seatsLeft(ev);
    const pct = Math.round(((ev.seats - left) / ev.seats) * 100);
    const low = left <= ev.seats * 0.15;

    return `
      <article class="event-card" data-id="${ev.id}" tabindex="0" style="animation-delay:${index * 60}ms"
               aria-label="${escapeHTML(ev.name)}, ${formatDate(ev.date)}">
        <div style="position:relative">
          <span class="tag">${CATEGORY_ICONS[ev.category] || ''} ${ev.category}</span>
          <div class="date-badge"><strong>${d.getDate()}</strong><span>${d.toLocaleString('en-IN', { month: 'short' })}</span></div>
          ${imageHTML(ev)}
        </div>
        <div class="card-body">
          <h3>${escapeHTML(ev.name)}</h3>
          <div class="card-meta">
            <span>📅 ${formatDate(ev.date)} · ${formatTime(ev.date)}</span>
            <span>📍 ${escapeHTML(ev.venue)}, ${escapeHTML(ev.city)}</span>
          </div>
          <p class="card-desc">${escapeHTML(ev.description)}</p>
          <div class="seats-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <p class="seats-text ${low ? 'low' : ''}">${left === 0 ? 'Sold out' : `${left} of ${ev.seats} seats left`}</p>
          <div class="card-foot">
            <span class="price">${formatPrice(ev.price)} ${ev.price ? '<small>/ person</small>' : ''}</span>
            <button class="btn btn-primary" data-action="details">View Details</button>
          </div>
        </div>
      </article>`;
  }

  function renderFeatured() {
    const featured = EVENTS.filter((e) => e.featured && !isPast(e))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    $('#featuredTrack').innerHTML = featured.map(cardHTML).join('');
  }

  function renderHeroNext() {
    const next = EVENTS.filter((e) => !isPast(e)).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const el = $('#heroNext');
    if (!next) { el.classList.add('hidden'); return; }

    el.innerHTML = `
      <div class="hc-img">${imageHTML(next, '')}</div>
      <div class="hc-body">
        <span class="hc-label">⏳ Next up</span>
        <h3>${escapeHTML(next.name)}</h3>
        <p class="meta">📍 ${escapeHTML(next.venue)}, ${escapeHTML(next.city)}</p>
        <div class="countdown" data-countdown="${next.date}"></div>
        <button class="btn btn-primary btn-block" data-open="${next.id}">View Event</button>
      </div>`;
    $('.hc-img .img-wrap', el).style.height = '100%';
    updateCountdowns();
  }

  /* ---------- Search / filter / sort ---------- */
  function renderChips() {
    const cats = ['All', ...new Set(EVENTS.map((e) => e.category))];
    $('#categoryChips').innerHTML = cats.map((c) => `
      <button class="chip ${c === state.category ? 'active' : ''}" role="tab"
              aria-selected="${c === state.category}" data-cat="${c}">${CATEGORY_ICONS[c] || ''} ${c}</button>`).join('');
  }

  function filteredEvents() {
    const q = state.search.trim().toLowerCase();
    const list = EVENTS.filter((e) => {
      const matchCat = state.category === 'All' || e.category === state.category;
      const haystack = `${e.name} ${e.venue} ${e.city} ${e.category} ${e.description}`.toLowerCase();
      return matchCat && (!q || haystack.includes(q));
    });

    const sorters = {
      date: (a, b) => new Date(a.date) - new Date(b.date),
      'price-low': (a, b) => a.price - b.price,
      'price-high': (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name)
    };
    return list.sort(sorters[state.sort]);
  }

  function renderEvents() {
    const list = filteredEvents();
    $('#eventsGrid').innerHTML = list.map(cardHTML).join('');
    $('#emptyState').classList.toggle('hidden', list.length > 0);
    $('#resultCount').textContent = `Showing ${list.length} event${list.length === 1 ? '' : 's'}` +
      (state.category !== 'All' ? ` in ${state.category}` : '') +
      (state.search ? ` matching “${state.search}”` : '');
  }

  function initFilters() {
    let debounce;
    $('#searchInput').addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.search = e.target.value;
        renderEvents();
      }, 200);
    });

    $('#sortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderEvents();
    });

    $('#categoryChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.category = chip.dataset.cat;
      renderChips();
      renderEvents();
    });

    $('#resetFilters').addEventListener('click', () => {
      state.category = 'All';
      state.search = '';
      $('#searchInput').value = '';
      renderChips();
      renderEvents();
    });

    // Hero search jumps to the events section with the query applied
    $('#heroSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#heroSearchInput').value;
      state.search = q;
      $('#searchInput').value = q;
      renderEvents();
      $('#events').scrollIntoView({ behavior: 'smooth' });
    });

    // Featured slider arrows
    const track = $('#featuredTrack');
    const step = () => track.clientWidth * 0.9;
    $('#featPrev').addEventListener('click', () => track.scrollBy({ left: -step() }));
    $('#featNext').addEventListener('click', () => track.scrollBy({ left: step() }));
  }

  /* ---------- Modals ---------- */
  let lastFocus = null;

  function openModal(modal) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    const close = $('.modal-close', modal);
    if (close) close.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (!$$('.modal').some((m) => !m.hidden)) document.body.classList.remove('no-scroll');
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  function showEventDetails(id) {
    const ev = getEvent(id);
    if (!ev) return;
    const left = seatsLeft(ev);

    $('#modalBody').innerHTML = `
      <div class="modal-hero">${imageHTML(ev, '')}</div>
      <div class="modal-content">
        <span class="cat-label">${CATEGORY_ICONS[ev.category] || ''} ${ev.category}</span>
        <h2 id="modalTitle">${escapeHTML(ev.name)}</h2>

        <div class="info-grid">
          <div class="info-item"><span class="ic">📅</span><div><small>Date</small><strong>${formatDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></div></div>
          <div class="info-item"><span class="ic">⏰</span><div><small>Time</small><strong>${formatTime(ev.date)}</strong></div></div>
          <div class="info-item"><span class="ic">📍</span><div><small>Venue</small><strong>${escapeHTML(ev.venue)}, ${escapeHTML(ev.city)}</strong></div></div>
          <div class="info-item"><span class="ic">🎟️</span><div><small>Seats left</small><strong>${left} / ${ev.seats}</strong></div></div>
          <div class="info-item"><span class="ic">💰</span><div><small>Price</small><strong>${formatPrice(ev.price)}</strong></div></div>
          <div class="info-item"><span class="ic">🏢</span><div><small>Organizer</small><strong>${escapeHTML(ev.organizer)}</strong></div></div>
        </div>

        <h4>Event starts in</h4>
        <div class="countdown" data-countdown="${ev.date}"></div>

        <h4>About this event</h4>
        <p>${escapeHTML(ev.description)}</p>

        <h4>Highlights</h4>
        <ul class="highlights">${ev.highlights.map((h) => `<li>${escapeHTML(h)}</li>`).join('')}</ul>

        <div class="modal-actions">
          <span class="price">${formatPrice(ev.price)} ${ev.price ? '<small>/ person</small>' : ''}</span>
          <button class="btn btn-primary" data-register="${ev.id}" ${left === 0 || isPast(ev) ? 'disabled' : ''}>
            ${left === 0 ? 'Sold Out' : isPast(ev) ? 'Event ended' : 'Register Now →'}
          </button>
        </div>
      </div>`;

    $('#modalBody .modal-hero .img-wrap').style.height = '100%';
    updateCountdowns();
    openModal($('#eventModal'));
  }

  function initModals() {
    // Open details from any card / hero button (event delegation)
    document.addEventListener('click', (e) => {
      const opener = e.target.closest('[data-open]');
      if (opener) { showEventDetails(opener.dataset.open); return; }

      const card = e.target.closest('.event-card');
      if (card) { showEventDetails(card.dataset.id); return; }

      const reg = e.target.closest('[data-register]');
      if (reg) {
        closeModal($('#eventModal'));
        selectEventInForm(reg.dataset.register);
        $('#register').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => $('#fullName').focus({ preventScroll: true }), 600);
      }
    });

    // Keyboard: Enter/Space on a focused card opens it
    document.addEventListener('keydown', (e) => {
      const card = e.target.closest && e.target.closest('.event-card');
      if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) {
        e.preventDefault();
        showEventDetails(card.dataset.id);
      }
      if (e.key === 'Escape') $$('.modal').filter((m) => !m.hidden).forEach(closeModal);
    });

    $$('.modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) closeModal(modal);
      });
    });
  }

  /* ---------- Countdown timers ---------- */
  function updateCountdowns() {
    $$('[data-countdown]').forEach((el) => {
      const diff = new Date(el.dataset.countdown) - new Date();
      if (diff <= 0) {
        el.innerHTML = '<div style="grid-column:1/-1"><strong>🎉 Live now / Ended</strong></div>';
        return;
      }
      const units = [
        ['Days', Math.floor(diff / 86400000)],
        ['Hours', Math.floor((diff / 3600000) % 24)],
        ['Mins', Math.floor((diff / 60000) % 60)],
        ['Secs', Math.floor((diff / 1000) % 60)]
      ];
      el.innerHTML = units.map(([label, v]) =>
        `<div><strong>${String(v).padStart(2, '0')}</strong><span>${label}</span></div>`).join('');
    });
  }

  /* ---------- Registration form ---------- */
  const form = $('#registerForm');

  const validators = {
    fullName(v) {
      v = v.trim();
      if (!v) return 'Please enter your full name.';
      if (v.length < 3) return 'Name must be at least 3 characters.';
      if (!/^[A-Za-z][A-Za-z .'-]*$/.test(v)) return 'Name can only contain letters, spaces, dots and hyphens.';
      return '';
    },
    email(v) {
      v = v.trim();
      if (!v) return 'Please enter your email address.';
      if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return 'Please enter a valid email (e.g. you@example.com).';
      return '';
    },
    phone(v) {
      const digits = v.replace(/[\s-]/g, '').replace(/^\+91/, '');
      if (!digits) return 'Please enter your phone number.';
      if (!/^[6-9]\d{9}$/.test(digits)) return 'Enter a valid 10-digit mobile number starting with 6–9.';
      return '';
    },
    eventSelect(v) {
      if (!v) return 'Please select an event.';
      const ev = getEvent(v);
      if (!ev) return 'Selected event was not found.';
      if (isPast(ev)) return 'This event has already ended.';
      if (seatsLeft(ev) === 0) return 'Sorry, this event is sold out.';
      return '';
    },
    tickets(v) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return 'Select at least 1 ticket.';
      if (n > 5) return 'You can book a maximum of 5 tickets.';
      const ev = getEvent(form.eventSelect.value);
      if (ev && n > seatsLeft(ev)) return `Only ${seatsLeft(ev)} seat(s) left for this event.`;
      return '';
    },
    terms(_, el) {
      return el.checked ? '' : 'You must accept the terms to continue.';
    }
  };

  function validateField(el) {
    const group = el.closest('.form-group');
    const msg = validators[el.name](el.value, el);
    group.classList.toggle('invalid', !!msg);
    group.classList.toggle('valid', !msg);
    $('.error-msg', group).textContent = msg;
    el.setAttribute('aria-invalid', String(!!msg));
    return !msg;
  }

  function populateEventSelect() {
    const select = $('#eventSelect');
    const current = select.value;
    const upcoming = EVENTS.filter((e) => !isPast(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
    select.innerHTML = '<option value="">-- Choose an event --</option>' + upcoming.map((e) => {
      const left = seatsLeft(e);
      return `<option value="${e.id}" ${left === 0 ? 'disabled' : ''}>${escapeHTML(e.name)} — ${formatDate(e.date, { day: 'numeric', month: 'short' })}${left === 0 ? ' (Sold out)' : ''}</option>`;
    }).join('');
    select.value = current;
  }

  function selectEventInForm(id) {
    $('#eventSelect').value = id;
    updateFormSummary();
    validateField($('#eventSelect'));
  }

  function updateFormSummary() {
    const ev = getEvent($('#eventSelect').value);
    const qty = Math.max(parseInt($('#tickets').value, 10) || 0, 0);
    $('#totalPrice').textContent = ev ? (ev.price ? formatPrice(ev.price * qty) : 'Free') : '₹0';

    $('#selectedPreview').innerHTML = ev ? `
      ${imageHTML(ev)}
      <div>
        <h4>${escapeHTML(ev.name)}</h4>
        <p>📅 ${formatDate(ev.date)} · ${formatTime(ev.date)}</p>
        <p>📍 ${escapeHTML(ev.city)} · ${seatsLeft(ev)} seats left</p>
      </div>` : '';
  }

  const ticketId = () => 'ES-' + Date.now().toString(36).toUpperCase().slice(-5) +
    Math.random().toString(36).slice(2, 5).toUpperCase();

  function initForm() {
    const fields = $$('input, select', form);

    // Validate on blur; re-validate live once a field has shown an error
    fields.forEach((el) => {
      el.addEventListener('blur', () => validateField(el));
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (el.closest('.form-group').classList.contains('invalid')) validateField(el);
        if (el.name === 'eventSelect' || el.name === 'tickets') updateFormSummary();
      });
    });

    // Only allow phone characters
    $('#phone').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^\d+\s-]/g, '');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const allValid = fields.map(validateField).every(Boolean);
      if (!allValid) {
        const firstBad = $('.form-group.invalid input, .form-group.invalid select', form);
        if (firstBad) firstBad.focus();
        toast('⚠️ Please fix the highlighted fields');
        return;
      }

      const data = {
        name: form.fullName.value.trim(),
        email: form.email.value.trim().toLowerCase(),
        phone: form.phone.value.replace(/[\s-]/g, '').replace(/^\+91/, ''),
        eventId: form.eventSelect.value,
        tickets: Number(form.tickets.value)
      };

      // Prevent the same email registering twice for one event
      if (registrations.some((r) => r.eventId === data.eventId && r.email === data.email)) {
        const group = form.email.closest('.form-group');
        group.classList.add('invalid');
        $('.error-msg', group).textContent = 'This email is already registered for this event.';
        form.email.focus();
        return;
      }

      const btn = $('#submitBtn');
      btn.classList.add('loading');
      btn.disabled = true;

      // Simulated network delay for a realistic feel
      setTimeout(() => {
        const ev = getEvent(data.eventId);
        const record = { ...data, id: ticketId(), total: ev.price * data.tickets, createdAt: new Date().toISOString() };
        registrations.unshift(record);
        store.set(STORAGE_KEY, registrations);

        btn.classList.remove('loading');
        btn.disabled = false;
        form.reset();
        $$('.form-group', form).forEach((g) => g.classList.remove('valid', 'invalid'));
        updateFormSummary();
        refreshAll();
        showSuccess(record, ev);
      }, 900);
    });
  }

  function showSuccess(r, ev) {
    $('#successBody').innerHTML = `
      <div class="check-circle">✓</div>
      <h3 id="successTitle">Registration Confirmed!</h3>
      <p>Thank you, <strong>${escapeHTML(r.name.split(' ')[0])}</strong>! Your spot is reserved.
         A confirmation would be sent to <strong>${escapeHTML(r.email)}</strong>.</p>
      <div class="ticket">
        <div><span>Ticket ID</span><strong>${r.id}</strong></div>
        <div><span>Event</span><strong>${escapeHTML(ev.name)}</strong></div>
        <div><span>Date</span><strong>${formatDate(ev.date)} · ${formatTime(ev.date)}</strong></div>
        <div><span>Venue</span><strong>${escapeHTML(ev.city)}</strong></div>
        <div><span>Tickets</span><strong>${r.tickets}</strong></div>
        <div><span>Total</span><strong>${r.total ? formatPrice(r.total) : 'Free'}</strong></div>
      </div>
      <a href="#my-registrations" class="btn btn-primary btn-block" data-close>View My Bookings</a>`;
    openModal($('#successModal'));
  }

  /* ---------- My Bookings ---------- */
  function renderBookings() {
    const list = $('#bookingsList');
    $('#bookingCount').textContent = registrations.length;

    if (!registrations.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎟️</div>
          <h3>No bookings yet</h3>
          <p>Register for an event and it will appear here.</p>
          <a href="#events" class="btn btn-outline">Browse events</a>
        </div>`;
      return;
    }

    list.innerHTML = registrations.map((r, i) => {
      const ev = getEvent(r.eventId);
      if (!ev) return '';
      return `
        <div class="booking" style="animation-delay:${i * 50}ms">
          ${imageHTML(ev)}
          <div>
            <h4>${escapeHTML(ev.name)}</h4>
            <p>📅 ${formatDate(ev.date)} · ${formatTime(ev.date)} · 📍 ${escapeHTML(ev.city)}</p>
            <p>👤 ${escapeHTML(r.name)} · ${r.tickets} ticket${r.tickets > 1 ? 's' : ''} · ${r.total ? formatPrice(r.total) : 'Free'}</p>
            <span class="ticket-id">${r.id}</span>
          </div>
          <div class="booking-actions">
            <button class="btn btn-outline" data-open="${ev.id}">Details</button>
            <button class="btn btn-ghost" data-cancel="${r.id}">Cancel</button>
          </div>
        </div>`;
    }).join('');
  }

  function initBookings() {
    $('#bookingsList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cancel]');
      if (!btn) return;
      if (!confirm('Cancel this registration?')) return;
      registrations = registrations.filter((r) => r.id !== btn.dataset.cancel);
      store.set(STORAGE_KEY, registrations);
      refreshAll();
      toast('Registration cancelled');
    });
  }

  /* ---------- Scroll effects ---------- */
  function initScrollEffects() {
    const navbar = $('#navbar');
    const topBtn = $('#backToTop');
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
      topBtn.classList.toggle('show', window.scrollY > 600);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Reveal-on-scroll animations
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$('.reveal').forEach((el) => io.observe(el));

    // Animated counters in hero
    $$('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / 1500, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString('en-IN') + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ---------- Init ---------- */
  function refreshAll() {
    renderFeatured();
    renderEvents();
    renderBookings();
    populateEventSelect();
    updateFormSummary();
  }

  function init() {
    $('#year').textContent = new Date().getFullYear();
    $('[data-count="12"]').dataset.count = EVENTS.filter((e) => !isPast(e)).length;
    $('[data-count="8"]').dataset.count = new Set(EVENTS.map((e) => e.city)).size;

    initTheme();
    initNavbar();
    renderChips();
    renderHeroNext();
    refreshAll();
    initFilters();
    initModals();
    initForm();
    initBookings();
    initScrollEffects();
    setInterval(updateCountdowns, 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
