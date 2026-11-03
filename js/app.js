/* =========================================================
   Eveora – Application logic
   Sections: helpers · theme · firebase & auth · navbar · rendering ·
             filters · modals · countdown · payment · form validation ·
             bookings & tickets · admin · scroll effects · init
   ========================================================= */

(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const THEME_KEY = 'eveora-theme';
  const CONFIG = window.ES_CONFIG || {};
  const SUPERADMIN = (CONFIG.SUPERADMIN_EMAIL || '').toLowerCase();
  const PAYMENT = CONFIG.PAYMENT || {};

  // Local Firebase emulators: open http://localhost:<port>/?emulator
  const USE_EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname) &&
    new URLSearchParams(location.search).has('emulator');

  const STATUS = {
    pending: { label: 'Under verification', short: 'Pending', icon: 'hourglass' },
    approved: { label: 'Confirmed', short: 'Approved', icon: 'check' },
    rejected: { label: 'Rejected', short: 'Rejected', icon: 'x' },
    cancelled: { label: 'Cancelled', short: 'Cancelled', icon: 'x' }
  };

  const state = { category: 'All', search: '', sort: 'date', adminFilter: 'pending', adminSearch: '', eventFilter: 'pending' };

  const EVENT_STATUS = {
    pending: { label: 'Awaiting approval', short: 'Pending', icon: 'hourglass', cls: 'pending' },
    published: { label: 'Live', short: 'Live', icon: 'check', cls: 'published' },
    rejected: { label: 'Not approved', short: 'Rejected', icon: 'x', cls: 'rejected' }
  };
  const EVENT_CATEGORIES = ['Music', 'Technology', 'Workshop', 'Sports', 'Food', 'Art', 'Business', 'Theatre', 'Wellness'];

  // Live data (from Firestore)
  const fb = { auth: null, db: null };
  let currentUser = null;            // { uid, name, email, picture }
  const roles = { admin: false, superadmin: false };
  let myRegs = [];                   // this user's registrations
  let adminRegs = [];                // every registration (admins only)
  let adminList = [];                // admins (superadmin only)
  let booked = {};                   // eventId -> approved tickets
  let proofData = null;              // compressed payment screenshot (data URL)
  const BASE_EVENTS = EVENTS.slice(); // built-in events from data.js
  let liveEvents = [];               // published events from Firestore
  let myEvents = [];                 // events this user submitted
  let adminEvents = [];              // every submitted event (admins only)
  let eventImage = null;             // compressed cover image for Host an Event
  let authResolved = false;
  const subs = {};                   // active Firestore listeners

  /* ---------- Helpers ---------- */
  const escapeHTML = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const formatPrice = (p) => (p === 0 ? 'Complimentary' : rupees(p));

  const formatDate = (iso, opts) => new Date(iso).toLocaleDateString('en-IN', opts || {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
  const formatTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  const tsDate = (ts) => (ts && ts.toDate ? ts.toDate() : null);
  const tsMillis = (ts) => (ts && ts.toMillis ? ts.toMillis() : Date.now());
  const formatStamp = (ts) => {
    const d = tsDate(ts);
    return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'just now';
  };

  const getEvent = (id) => EVENTS.find((e) => e.id === id);
  const seatsLeft = (ev) => Math.max(ev.seats - (booked[ev.id] || 0), 0);
  const isPast = (ev) => new Date(ev.date) < new Date();
  const firstName = (name) => String(name || '').split(' ')[0];

  // Image with an elegant initial-letter fallback if the remote image fails
  const imageHTML = (ev, extra = '') => `
    <div class="img-wrap ${extra}">
      <span class="fallback" aria-hidden="true">${escapeHTML((ev.name || 'E').charAt(0))}</span>
      ${ev.image ? `<img src="${escapeHTML(ev.image)}" alt="${escapeHTML(ev.name)}" loading="lazy" onerror="this.classList.add('failed')">` : ''}
    </div>`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function copyText(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'), () => toast('Copy failed'));
    }
  }

  /* ---------- Theme (dark / light) ---------- */
  function initTheme() {
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      renderGoogleButtons();
    });
  }

  /* ---------- Firebase & Google Sign-In ---------- */
  const GOOGLE_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>`;

  const clientId = () => CONFIG.GOOGLE_CLIENT_ID || '';
  const gisConfigured = () => /\.apps\.googleusercontent\.com$/.test(clientId()) && !clientId().startsWith('YOUR_');
  const googleReady = () => !!(window.google && google.accounts && google.accounts.id);
  const firebaseReady = () => !!fb.auth;
  let googleInitialised = false;
  let oneTapShown = false;

  function initFirebase() {
    if (!window.firebase) return false;
    const cfg = USE_EMULATOR
      ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-eveora' }
      : (CONFIG.FIREBASE || {});
    if (!cfg.apiKey || !cfg.projectId) return false;
    try {
      firebase.initializeApp(cfg);
      fb.auth = firebase.auth();
      fb.db = firebase.firestore();
      if (USE_EMULATOR) {
        fb.auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
        fb.db.useEmulator('127.0.0.1', 8181);
        window.__eveora = { auth: fb.auth, db: fb.db }; // for local testing only
      }
      return true;
    } catch (e) {
      console.error('[Eveora] Firebase init failed', e);
      return false;
    }
  }

  const backendMissing = () => toast('The booking service is not configured yet.');

  function handleCredential(response) {
    if (!firebaseReady()) { backendMissing(); return; }
    const credential = firebase.auth.GoogleAuthProvider.credential(response.credential);
    fb.auth.signInWithCredential(credential)
      .then((res) => toast(`Welcome, ${firstName(res.user.displayName) || 'guest'}.`))
      .catch((err) => {
        console.error('[Eveora] Sign-in failed', err);
        toast('Google sign-in failed. Please try again.');
      });
  }

  function popupSignIn() {
    if (!firebaseReady()) { backendMissing(); return; }
    fb.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
      .then((res) => toast(`Welcome, ${firstName(res.user.displayName) || 'guest'}.`))
      .catch((err) => {
        if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) {
          console.error('[Eveora] Sign-in failed', err);
          toast('Google sign-in failed. Please try again.');
        }
      });
  }

  function signOut() {
    if (googleReady()) google.accounts.id.disableAutoSelect();
    if (fb.auth) fb.auth.signOut().then(() => toast('You have been signed out.'));
  }

  function onAuthChanged(user) {
    authResolved = true;
    ['myRegs', 'role', 'adminRegs', 'admins', 'myEvents', 'adminEvents'].forEach(unlisten);
    myRegs = []; adminRegs = []; adminList = []; myEvents = []; adminEvents = [];
    state.eventFilter = 'pending';
    roles.admin = roles.superadmin = false;
    state.adminFilter = 'pending';
    state.adminSearch = '';
    $('#adminSearch').value = '';

    if (user) {
      const email = (user.email || '').toLowerCase();
      currentUser = { uid: user.uid, name: user.displayName || email.split('@')[0], email, picture: user.photoURL || '' };
      roles.superadmin = !!SUPERADMIN && email === SUPERADMIN && user.emailVerified;
      roles.admin = roles.superadmin;
      listenMyRegistrations();
      listenMyEvents();
      if (roles.superadmin) startAdminListeners();
      else listenRole();
    } else {
      currentUser = null;
      maybePromptOneTap();
    }
    renderAuth();
    refreshAll();
  }

  /* ---------- Firestore listeners ---------- */
  function listen(key, ref, onData) {
    unlisten(key);
    subs[key] = ref.onSnapshot(onData, (err) => console.error(`[Eveora] ${key} listener`, err));
  }
  function unlisten(key) {
    if (subs[key]) { subs[key](); delete subs[key]; }
  }
  const docData = (d) => ({ id: d.id, ...d.data() });
  const byNewest = (a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt);

  function listenMyRegistrations() {
    listen('myRegs', fb.db.collection('registrations').where('uid', '==', currentUser.uid), (snap) => {
      myRegs = snap.docs.map(docData).sort(byNewest);
      renderBookings();
      populateEventSelect();
    });
  }

  // Non-superadmins become admins when the superadmin adds their email
  function listenRole() {
    listen('role', fb.db.collection('admins').doc(currentUser.email), (doc) => {
      const was = roles.admin;
      roles.admin = doc.exists;
      if (roles.admin && !was) { startAdminListeners(); toast('You now have admin access.'); }
      if (!roles.admin && was) { unlisten('adminRegs'); unlisten('adminEvents'); adminRegs = []; adminEvents = []; }
      renderAuth();
      renderAdmin();
    });
  }

  function startAdminListeners() {
    listen('adminRegs', fb.db.collection('registrations').orderBy('createdAt', 'desc').limit(300), (snap) => {
      adminRegs = snap.docs.map(docData);
      renderAdmin();
    });
    listen('adminEvents', fb.db.collection('events').orderBy('createdAt', 'desc').limit(200), (snap) => {
      adminEvents = snap.docs.map(docData);
      renderAdmin();
    });
    if (roles.superadmin) {
      listen('admins', fb.db.collection('admins'), (snap) => {
        adminList = snap.docs.map((d) => d.data()).sort((a, b) => a.email.localeCompare(b.email));
        renderAdminManager();
      });
    }
  }

  function listenStats() {
    listen('stats', fb.db.collection('eventStats'), (snap) => {
      booked = {};
      snap.forEach((d) => { booked[d.id] = d.data().booked || 0; });
      renderFeatured();
      renderEvents();
      populateEventSelect();
      updateFormSummary();
      renderAdmin();
    });
  }

  /* ---------- Auth UI ---------- */
  const avatarHTML = (u) => {
    const initial = escapeHTML((u.name || '?').trim().charAt(0).toUpperCase());
    return u.picture
      ? `<img src="${escapeHTML(u.picture)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${initial}'))">`
      : initial;
  };

  // Google's official button when available, otherwise a styled fallback
  function renderGoogleButtons() {
    $$('.g-btn-slot').forEach((slot) => {
      const large = slot.dataset.size === 'large';
      slot.innerHTML = '';
      if (googleInitialised) {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        const compact = !large && window.innerWidth < 600;
        google.accounts.id.renderButton(slot, {
          type: compact ? 'icon' : 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: large ? 'large' : 'medium',
          shape: 'pill',
          text: large ? 'signin_with' : 'signin',
          logo_alignment: 'left',
          width: large ? 260 : undefined
        });
      } else {
        slot.innerHTML = `<button type="button" class="g-fallback ${large ? 'lg' : ''}">${GOOGLE_ICON}<span>${large ? 'Sign in with Google' : 'Sign in'}</span></button>`;
      }
    });
  }

  function renderAuth() {
    const signedIn = !!currentUser;
    $('#googleBtnNav').classList.toggle('hidden', signedIn);
    $('#userMenu').classList.toggle('hidden', !signedIn);
    $('#formShell').classList.toggle('locked', !signedIn);
    $('#hostShell').classList.toggle('locked', !signedIn);
    $('#evFeaturedRow').classList.toggle('hidden', !roles.admin);
    $('#hostSubmit .btn-label').textContent = roles.admin ? 'Publish Event' : 'Submit for Approval';
    $('#hostIntro').textContent = roles.admin
      ? 'As an Eveora admin, events you publish here go live immediately.'
      : "Present your event to Eveora's guests. Every submission is reviewed by our team and goes live once approved.";
    $('#userDropdown').hidden = true;
    $('#userChip').setAttribute('aria-expanded', 'false');

    if (signedIn) {
      $('#userAvatar').innerHTML = avatarHTML(currentUser);
      $('#ddAvatar').innerHTML = avatarHTML(currentUser);
      $('#userName').textContent = firstName(currentUser.name);
      $('#ddName').textContent = currentUser.name;
      $('#ddEmail').textContent = currentUser.email;
      const role = roles.superadmin ? 'Superadmin' : roles.admin ? 'Admin' : '';
      $('#userRole').textContent = role;
      $('#userRole').classList.toggle('hidden', !role);
      $('#ddAdmin').classList.toggle('hidden', !roles.admin);
    }
    prefillUser();
  }

  // Name & email come from the Google account
  function prefillUser() {
    const f = $('#registerForm');
    f.fullName.value = currentUser ? (f.fullName.value || currentUser.name) : '';
    f.email.value = currentUser ? currentUser.email : '';
  }

  function maybePromptOneTap() {
    if (googleInitialised && authResolved && !currentUser && !oneTapShown) {
      oneTapShown = true;
      google.accounts.id.prompt();
    }
  }

  function initGoogle() {
    if (googleInitialised || !gisConfigured() || !googleReady() || !firebaseReady() || USE_EMULATOR) return;
    google.accounts.id.initialize({
      client_id: clientId(),
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup'
    });
    googleInitialised = true;
    renderGoogleButtons();
    maybePromptOneTap();
  }

  function initAuth() {
    renderGoogleButtons();
    renderAuth();

    // The styled fallback button signs in through a Firebase popup
    document.addEventListener('click', (e) => {
      if (e.target.closest('.g-fallback')) popupSignIn();
    });

    const chip = $('#userChip');
    const dd = $('#userDropdown');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      dd.hidden = !dd.hidden;
      chip.setAttribute('aria-expanded', String(!dd.hidden));
    });
    document.addEventListener('click', (e) => {
      if (!dd.hidden && !e.target.closest('#userMenu')) { dd.hidden = true; chip.setAttribute('aria-expanded', 'false'); }
    });
    $$('a', dd).forEach((a) => a.addEventListener('click', () => { dd.hidden = true; }));
    $('#signOutBtn').addEventListener('click', signOut);

    // The Google library loads async – initialise whichever finishes last
    if (googleReady()) initGoogle();
    else window.onGoogleLibraryLoad = initGoogle;

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (googleInitialised) renderGoogleButtons(); }, 300);
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
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          $$('a', links).forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach((s) => spy.observe(s));
  }

  /* ---------- Event cards ---------- */
  function cardHTML(ev, index = 0) {
    const d = new Date(ev.date);
    const left = seatsLeft(ev);
    const pct = Math.round(((ev.seats - left) / ev.seats) * 100);
    const low = left <= ev.seats * 0.15;

    return `
      <article class="event-card" data-id="${ev.id}" tabindex="0" style="animation-delay:${index * 70}ms"
               aria-label="${escapeHTML(ev.name)}, ${formatDate(ev.date)}">
        <div class="media">
          <span class="tag">${escapeHTML(ev.category)}</span>
          <div class="date-badge"><strong>${d.getDate()}</strong><span>${d.toLocaleString('en-IN', { month: 'short' })}</span></div>
          ${imageHTML(ev)}
        </div>
        <div class="card-body">
          <h3>${escapeHTML(ev.name)}</h3>
          <div class="card-meta">
            <span>${ic('calendar')} ${formatDate(ev.date)} · ${formatTime(ev.date)}</span>
            <span>${ic('pin')} ${escapeHTML(ev.venue)}, ${escapeHTML(ev.city)}</span>
          </div>
          <p class="card-desc">${escapeHTML(ev.description)}</p>
          <div class="seats-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <p class="seats-text ${low ? 'low' : ''}">${left === 0 ? 'Fully booked' : `${left} of ${ev.seats} seats available`}</p>
          <div class="card-foot">
            <span class="price">${formatPrice(ev.price)} ${ev.price ? '<small>/ guest</small>' : ''}</span>
            <button class="btn btn-outline btn-sm" data-action="details">Discover</button>
          </div>
        </div>
      </article>`;
  }

  function renderFeatured() {
    const featured = EVENTS.filter((e) => e.featured && !isPast(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
    $('#featuredTrack').innerHTML = featured.map(cardHTML).join('');
  }

  function renderHeroNext() {
    const next = EVENTS.filter((e) => !isPast(e)).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const el = $('#heroNext');
    if (!next) { el.classList.add('hidden'); return; }

    el.innerHTML = `
      <div class="hc-img">${imageHTML(next)}</div>
      <div class="hc-body">
        <span class="hc-label">Next on the calendar</span>
        <h3>${escapeHTML(next.name)}</h3>
        <p class="meta">${ic('pin')} ${escapeHTML(next.venue)}, ${escapeHTML(next.city)}</p>
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
              aria-selected="${c === state.category}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('');
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
      debounce = setTimeout(() => { state.search = e.target.value; renderEvents(); }, 200);
    });
    $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; renderEvents(); });
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
    $('#heroSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#heroSearchInput').value;
      state.search = q;
      $('#searchInput').value = q;
      renderEvents();
      $('#events').scrollIntoView({ behavior: 'smooth' });
    });

    const track = $('#featuredTrack');
    const step = () => track.clientWidth * 0.9;
    $('#featPrev').addEventListener('click', () => track.scrollBy({ left: -step() }));
    $('#featNext').addEventListener('click', () => track.scrollBy({ left: step() }));
  }

  /* ---------- Modals ---------- */
  let lastFocus = null;
  let confirmResolve = null;

  function openModal(modal) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    const focusable = $('.modal-close', modal) || $('button', modal);
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeModal(modal) {
    if (modal.hidden) return;
    modal.hidden = true;
    if (modal.id === 'confirmModal' && confirmResolve) { const r = confirmResolve; confirmResolve = null; r(false); }
    if (!$$('.modal').some((m) => !m.hidden)) document.body.classList.remove('no-scroll');
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  // Styled replacement for confirm()/prompt(). Resolves with the text entered ('' if none) or false.
  function askConfirm({ title, text, okLabel = 'Confirm', danger = false, input = null }) {
    return new Promise((resolve) => {
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      const field = $('#confirmInput');
      field.hidden = !input;
      field.value = '';
      field.placeholder = input ? input.placeholder || '' : '';
      $('#confirmError').textContent = '';
      const ok = $('#confirmOk');
      ok.textContent = okLabel;
      ok.classList.toggle('btn-danger', danger);
      ok.classList.toggle('btn-primary', !danger);
      confirmResolve = resolve;
      openModal($('#confirmModal'));
      if (input) setTimeout(() => field.focus(), 60);
    });
  }

  function showEventDetails(id) {
    const ev = getEvent(id);
    if (!ev) return;
    const left = seatsLeft(ev);

    $('#modalBody').innerHTML = `
      <div class="modal-hero">${imageHTML(ev)}</div>
      <div class="modal-content">
        <span class="eyebrow">${escapeHTML(ev.category)}</span>
        <h2 id="modalTitle">${escapeHTML(ev.name)}</h2>

        <div class="info-grid">
          <div class="info-item">${ic('calendar')}<div><small>Date</small><strong>${formatDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong></div></div>
          <div class="info-item">${ic('clock')}<div><small>Time</small><strong>${formatTime(ev.date)}</strong></div></div>
          <div class="info-item">${ic('pin')}<div><small>Venue</small><strong>${escapeHTML(ev.venue)}, ${escapeHTML(ev.city)}</strong></div></div>
          <div class="info-item">${ic('ticket')}<div><small>Seats available</small><strong>${left} of ${ev.seats}</strong></div></div>
          <div class="info-item">${ic('sparkle')}<div><small>Price</small><strong>${formatPrice(ev.price)}${ev.price ? ' per guest' : ''}</strong></div></div>
          <div class="info-item">${ic('building')}<div><small>Hosted by</small><strong>${escapeHTML(ev.organizer)}</strong></div></div>
        </div>

        <h4>Begins in</h4>
        <div class="countdown" data-countdown="${ev.date}"></div>

        <h4>About the experience</h4>
        <p>${escapeHTML(ev.description)}</p>

        <h4>Highlights</h4>
        <ul class="highlights">${ev.highlights.map((h) => `<li>${escapeHTML(h)}</li>`).join('')}</ul>

        <div class="modal-actions">
          <span class="price">${formatPrice(ev.price)} ${ev.price ? '<small>/ guest</small>' : ''}</span>
          <button class="btn btn-primary" data-register="${ev.id}" ${left === 0 || isPast(ev) ? 'disabled' : ''}>
            ${left === 0 ? 'Fully booked' : isPast(ev) ? 'Event ended' : 'Reserve now'}
          </button>
        </div>
      </div>`;

    $('#modalBody .modal-hero .img-wrap').style.height = '100%';
    updateCountdowns();
    openModal($('#eventModal'));
  }

  function initModals() {
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
        if (currentUser) setTimeout(() => $('#phone').focus({ preventScroll: true }), 700);
        return;
      }

      const proof = e.target.closest('[data-proof]');
      if (proof) { showProof(proof.dataset.proof); return; }

      const ticket = e.target.closest('[data-ticket]');
      if (ticket) { showTicket(ticket.dataset.ticket); return; }

      const copy = e.target.closest('[data-copy]');
      if (copy) copyText(copy.dataset.copy);
    });

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

    $('#confirmOk').addEventListener('click', () => {
      const field = $('#confirmInput');
      if (!field.hidden && field.value.trim().length < 3) {
        $('#confirmError').textContent = 'Please add a short reason.';
        field.focus();
        return;
      }
      const resolve = confirmResolve;
      confirmResolve = null;
      closeModal($('#confirmModal'));
      if (resolve) resolve(field.hidden ? '' : field.value.trim());
    });
  }

  /* ---------- Countdown timers ---------- */
  function updateCountdowns() {
    $$('[data-countdown]').forEach((el) => {
      const diff = new Date(el.dataset.countdown) - new Date();
      if (diff <= 0) {
        el.innerHTML = '<div style="grid-column:1/-1"><strong>Now live</strong></div>';
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

  /* ---------- Payment ---------- */
  const upiConfigured = () => /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(PAYMENT.UPI_ID || '');
  const normaliseUtr = (v) => String(v || '').replace(/[\s-]/g, '').toUpperCase();
  let lastQr = '';

  function renderQr(box, text, size) {
    box.innerHTML = '';
    if (window.QRCode) new QRCode(box, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    else box.innerHTML = '<div class="qr-placeholder">QR unavailable</div>';
  }

  function renderPayment(ev, qty) {
    const amount = ev ? ev.price * qty : 0;
    const paid = amount > 0;
    $('#paymentBlock').classList.toggle('hidden', !paid);
    $('#submitBtn .btn-label').textContent = paid ? 'Submit for Verification' : 'Confirm Reservation';
    if (!paid) return;

    $('#payAmount').textContent = rupees(amount);
    const configured = upiConfigured();
    $('#payDemoNote').classList.toggle('hidden', configured);
    $('#upiRow').classList.toggle('hidden', !configured);
    $('#upiLink').classList.toggle('hidden', !configured);

    if (configured) {
      const link = `upi://pay?pa=${encodeURIComponent(PAYMENT.UPI_ID)}&pn=${encodeURIComponent(PAYMENT.PAYEE_NAME || 'Eveora')}` +
        `&am=${amount}&cu=INR&tn=${encodeURIComponent(('Eveora ' + ev.name).slice(0, 40))}`;
      $('#upiId').textContent = PAYMENT.UPI_ID;
      $('#copyUpi').dataset.copy = PAYMENT.UPI_ID;
      $('#upiLink').href = link;
      if (link !== lastQr) { lastQr = link; renderQr($('#payQr'), link, 168); }
    } else {
      lastQr = '';
      $('#payQr').innerHTML = '<div class="qr-placeholder">The payment QR appears here once a UPI ID is configured.</div>';
    }
  }

  // Shrink screenshots so they fit in a Firestore document (free plan, no file storage needed)
  function compressImage(file, maxSide = 1600, maxLen = 700000) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        let quality = 0.78;
        let data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > maxLen && quality > 0.35) {
          quality -= 0.1;
          data = canvas.toDataURL('image/jpeg', quality);
        }
        if (data.length > maxLen * 1.25) reject(new Error('too-large'));
        else resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }

  function setProofPreview(data) {
    const img = $('#proofPreview');
    const box = $('#uploadBox');
    if (data) { img.src = data; img.hidden = false; box.classList.add('has-file'); }
    else { img.removeAttribute('src'); img.hidden = true; box.classList.remove('has-file'); }
  }

  function initProofUpload() {
    const input = $('#proof');
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      proofData = null;
      setProofPreview(null);
      if (!file) { validateField(input); return; }
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        input.value = '';
        setFieldState(input, 'Please upload a JPG, PNG or WebP image.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        input.value = '';
        setFieldState(input, 'The image must be 10 MB or smaller.');
        return;
      }
      $('#uploadBox').classList.add('busy');
      try {
        proofData = await compressImage(file);
        setProofPreview(proofData);
        validateField(input);
      } catch (e) {
        input.value = '';
        setFieldState(input, 'That image could not be read. Please try another screenshot.');
      } finally {
        $('#uploadBox').classList.remove('busy');
      }
    });
  }

  /* ---------- Registration form ---------- */
  const form = $('#registerForm');

  const paymentRequired = () => {
    const ev = getEvent(form.eventSelect.value);
    return !!ev && ev.price > 0;
  };

  const activeBookingFor = (eventId) => myRegs.find((r) => r.eventId === eventId && ['pending', 'approved'].includes(r.status));

  const validators = {
    fullName(v) {
      v = v.trim();
      if (!v) return 'Please enter your full name.';
      if (v.length < 3) return 'Name must be at least 3 characters.';
      if (!/^\p{L}[\p{L}\p{M} .'-]*$/u.test(v)) return 'Name can only contain letters, spaces, dots and hyphens.';
      return '';
    },
    email(v) {
      v = v.trim();
      if (!v) return 'Please sign in so we can use your email.';
      if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return 'Please enter a valid email.';
      return '';
    },
    phone(v) {
      const digits = v.replace(/[\s-]/g, '').replace(/^\+91/, '');
      if (!digits) return 'Please enter your phone number.';
      if (!/^[6-9]\d{9}$/.test(digits)) return 'Enter a valid 10-digit mobile number starting with 6–9.';
      return '';
    },
    eventSelect(v) {
      if (!v) return 'Please choose an event.';
      const ev = getEvent(v);
      if (!ev) return 'Selected event was not found.';
      if (isPast(ev)) return 'This event has already ended.';
      if (seatsLeft(ev) === 0) return 'Sorry, this event is fully booked.';
      if (activeBookingFor(v)) return 'You already have a booking for this event.';
      return '';
    },
    tickets(v) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return 'Select at least 1 ticket.';
      if (n > 5) return 'You can reserve up to 5 tickets.';
      const ev = getEvent(form.eventSelect.value);
      if (ev && n > seatsLeft(ev)) return `Only ${seatsLeft(ev)} seat(s) remain for this event.`;
      return '';
    },
    utr(v) {
      if (!paymentRequired()) return '';
      const u = normaliseUtr(v);
      if (!u) return 'Please enter the UTR / UPI reference number.';
      if (!/^[A-Z0-9]{12,22}$/.test(u)) return 'The UTR should be 12–22 letters or digits (UPI UTRs are 12 digits).';
      if (myRegs.some((r) => r.utr === u && ['pending', 'approved'].includes(r.status))) return 'You have already used this UTR for another booking.';
      return '';
    },
    proof() {
      if (!paymentRequired()) return '';
      return proofData ? '' : 'Please upload a screenshot of your payment.';
    },
    terms(_, el) {
      return el.checked ? '' : 'Please accept the terms to continue.';
    }
  };

  function setFieldState(el, msg) {
    const group = el.closest('.form-group');
    group.classList.toggle('invalid', !!msg);
    group.classList.toggle('valid', !msg);
    $('.error-msg', group).textContent = msg;
    el.setAttribute('aria-invalid', String(!!msg));
  }

  function validateField(el) {
    const fn = validators[el.name];
    if (!fn) return true;
    const msg = fn(el.value, el);
    setFieldState(el, msg);
    return !msg;
  }

  function populateEventSelect() {
    const select = $('#eventSelect');
    const current = select.value;
    const upcoming = EVENTS.filter((e) => !isPast(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
    select.innerHTML = '<option value="">Choose an event</option>' + upcoming.map((e) => {
      const left = seatsLeft(e);
      return `<option value="${e.id}" ${left === 0 ? 'disabled' : ''}>${escapeHTML(e.name)} — ${formatDate(e.date, { day: 'numeric', month: 'short' })}${left === 0 ? ' (Fully booked)' : ''}</option>`;
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
    $('#totalPrice').textContent = ev ? (ev.price ? rupees(ev.price * qty) : 'Complimentary') : '₹0';
    renderPayment(ev, qty || 1);

    $('#selectedPreview').innerHTML = ev ? `
      ${imageHTML(ev)}
      <div>
        <h4>${escapeHTML(ev.name)}</h4>
        <p>${ic('calendar')} ${formatDate(ev.date)} · ${formatTime(ev.date)}</p>
        <p>${ic('pin')} ${escapeHTML(ev.city)} · ${seatsLeft(ev)} seats available</p>
      </div>` : '';
  }

  function resetForm() {
    form.reset();
    proofData = null;
    setProofPreview(null);
    $$('.form-group', form).forEach((g) => g.classList.remove('valid', 'invalid'));
    $$('.error-msg', form).forEach((m) => { m.textContent = ''; });
    prefillUser();
    updateFormSummary();
  }

  function initForm() {
    const fields = $$('input, select', form);

    // Validate on blur; re-validate live once a field has shown an error
    fields.filter((el) => el.type !== 'file').forEach((el) => {
      el.addEventListener('blur', () => validateField(el));
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (el.closest('.form-group').classList.contains('invalid')) validateField(el);
        if (el.name === 'eventSelect' || el.name === 'tickets') updateFormSummary();
      });
    });

    $('#phone').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^\d+\s-]/g, ''); });
    $('#utr').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, ''); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) {
        toast('Please sign in with Google to reserve.');
        $('#register').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (!firebaseReady()) { backendMissing(); return; }

      form.email.value = currentUser.email;
      const allValid = fields.map(validateField).every(Boolean);
      if (!allValid) {
        const firstBad = $('.form-group.invalid input, .form-group.invalid select', form);
        if (firstBad) firstBad.focus();
        toast('Please review the highlighted fields.');
        return;
      }

      const ev = getEvent(form.eventSelect.value);
      const tickets = Number(form.tickets.value);
      const amount = ev.price * tickets;
      const paid = amount > 0;
      const utr = paid ? normaliseUtr(form.utr.value) : '';
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const regRef = fb.db.collection('registrations').doc();

      const record = {
        uid: currentUser.uid,
        name: form.fullName.value.trim(),
        email: currentUser.email,
        phone: form.phone.value.replace(/[\s-]/g, '').replace(/^\+91/, ''),
        eventId: ev.id,
        eventName: ev.name,
        eventDate: ev.date,
        tickets,
        price: ev.price,
        amount,
        utr,
        hasProof: paid,
        status: 'pending',
        createdAt: now
      };

      const batch = fb.db.batch();
      batch.set(regRef, record);
      if (paid) {
        batch.set(fb.db.collection('paymentProofs').doc(regRef.id), { uid: currentUser.uid, regId: regRef.id, image: proofData, createdAt: now });
        batch.set(fb.db.collection('utrs').doc(utr), { uid: currentUser.uid, regId: regRef.id, createdAt: now });
      }

      const btn = $('#submitBtn');
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        await batch.commit();
        resetForm();
        showSuccess(record, ev);
      } catch (err) {
        console.error('[Eveora] Registration failed', err);
        if (paid && err.code === 'permission-denied') {
          setFieldState(form.utr, 'This UTR has already been submitted. Please check the number.');
          form.utr.focus();
        }
        toast('Your reservation could not be submitted. Please try again.');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }

  function showSuccess(r, ev) {
    const paid = r.amount > 0;
    $('#successBody').innerHTML = `
      <div class="seal">${ic('hourglass')}</div>
      <h3 id="successTitle">${paid ? 'Payment received for review' : 'Reservation received'}</h3>
      <p>Thank you, <strong>${escapeHTML(firstName(r.name))}</strong>. ${paid
        ? 'Our team will match your UTR and screenshot with our records.'
        : 'Our team will confirm your place shortly.'}
        Your ticket will appear in <strong>My Bookings</strong> as soon as it's approved.</p>
      <div class="summary">
        <div><span>Event</span><strong>${escapeHTML(ev.name)}</strong></div>
        <div><span>Date</span><strong>${formatDate(ev.date)} · ${formatTime(ev.date)}</strong></div>
        <div><span>Guests</span><strong>${r.tickets}</strong></div>
        <div><span>Amount</span><strong>${paid ? rupees(r.amount) : 'Complimentary'}</strong></div>
        ${paid ? `<div><span>UTR</span><strong>${escapeHTML(r.utr)}</strong></div>` : ''}
        <div><span>Status</span><strong>Under verification</strong></div>
      </div>
      <a href="#my-registrations" class="btn btn-primary btn-block" data-close>View My Bookings</a>`;
    openModal($('#successModal'));
  }

  /* ---------- My Bookings & tickets ---------- */
  const eventFor = (r) => getEvent(r.eventId) ||
    { id: r.eventId, name: r.eventName, date: r.eventDate, city: '', venue: '', image: '' };

  const statusBadge = (s) => `<span class="status-badge ${s}">${ic(STATUS[s].icon)} ${STATUS[s].label}</span>`;

  function renderBookings() {
    const list = $('#bookingsList');
    const mine = myRegs.filter((r) => r.status !== 'cancelled');
    $('#bookingCount').textContent = mine.length;

    if (!currentUser) {
      list.innerHTML = `
        <div class="empty-state">
          ${ic('lock')}
          <h3>Sign in to view your bookings</h3>
          <p>Your reservations are linked to your Google account.</p>
          <a href="#register" class="btn btn-outline">Sign in</a>
        </div>`;
      return;
    }

    if (!mine.length) {
      list.innerHTML = `
        <div class="empty-state">
          ${ic('ticket')}
          <h3>No reservations yet</h3>
          <p>Your bookings and tickets will appear here.</p>
          <a href="#events" class="btn btn-outline">Browse events</a>
        </div>`;
      return;
    }

    list.innerHTML = mine.map((r, i) => {
      const ev = eventFor(r);
      const date = ev.date ? `${formatDate(ev.date)} · ${formatTime(ev.date)}` : '';
      return `
        <div class="booking" style="animation-delay:${i * 60}ms">
          ${imageHTML(ev)}
          <div>
            <h4>${escapeHTML(ev.name)}</h4>
            <p>${ic('calendar')} ${date} ${ev.city ? `· ${ic('pin')} ${escapeHTML(ev.city)}` : ''}</p>
            <p>${ic('user')} ${r.tickets} guest${r.tickets > 1 ? 's' : ''} · ${r.amount ? rupees(r.amount) : 'Complimentary'}${r.utr ? ` · UTR ${escapeHTML(r.utr)}` : ''}</p>
            <div class="status-line">
              ${statusBadge(r.status)}
              ${r.status === 'rejected' && r.rejectReason ? `<span class="reason">${escapeHTML(r.rejectReason)}</span>` : ''}
            </div>
          </div>
          <div class="booking-actions">
            ${r.status === 'approved' && r.ticketId ? `<button class="btn btn-primary btn-sm" data-ticket="${r.id}">${ic('ticket')} View ticket</button>` : ''}
            <button class="btn btn-outline btn-sm" data-open="${escapeHTML(ev.id)}">Details</button>
            ${r.hasProof ? `<button class="btn btn-outline btn-sm" data-proof="${r.id}">Payment proof</button>` : ''}
            ${r.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-cancel="${r.id}">Cancel</button>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // Tickets exist only after an admin approves (the ticket ID is issued on approval)
  function showTicket(id) {
    const r = myRegs.find((x) => x.id === id);
    if (!r || r.status !== 'approved' || !r.ticketId) { toast('Your ticket is issued once the payment is approved.'); return; }
    const ev = eventFor(r);
    $('#ticketBody').innerHTML = `
      <div class="ticket-card">
        <div class="tk-top">
          <div class="tk-brand"><span class="logo-mark" aria-hidden="true">E</span> Eveora</div>
          <p class="tk-admit">Admit ${r.tickets} · Confirmed</p>
          <h3 id="ticketTitle">${escapeHTML(ev.name)}</h3>
          <div class="tk-meta">
            <div><small>Date</small><strong>${ev.date ? formatDate(ev.date) : ''}</strong></div>
            <div><small>Time</small><strong>${ev.date ? formatTime(ev.date) : ''}</strong></div>
            <div><small>Venue</small><strong>${escapeHTML(ev.venue ? `${ev.venue}, ${ev.city}` : ev.city)}</strong></div>
            <div><small>Guest</small><strong>${escapeHTML(r.name)}</strong></div>
          </div>
        </div>
        <div class="tk-cut"></div>
        <div class="tk-bottom">
          <div class="tk-qr" id="ticketQr"></div>
          <div class="tk-id">
            <small>Ticket ID</small>
            <strong>${escapeHTML(r.ticketId)}</strong>
            <p>Show this ticket at the entrance.</p>
          </div>
        </div>
      </div>
      <div class="ticket-actions"><button class="btn btn-outline btn-sm" data-copy="${escapeHTML(r.ticketId)}">${ic('copy')} Copy ticket ID</button></div>`;
    renderQr($('#ticketQr'), `EVEORA|${r.ticketId}|${r.eventId}|${r.tickets}`, 92);
    openModal($('#ticketModal'));
  }

  function initBookings() {
    $('#bookingsList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-cancel]');
      if (!btn) return;
      const r = myRegs.find((x) => x.id === btn.dataset.cancel);
      if (!r) return;
      const ok = await askConfirm({
        title: 'Cancel this reservation?',
        text: r.amount ? 'It will be withdrawn from review. If you have already paid, please contact the organiser about a refund.' : 'Your reservation will be cancelled.',
        okLabel: 'Cancel reservation',
        danger: true
      });
      if (ok === false) return;
      const batch = fb.db.batch();
      batch.update(fb.db.collection('registrations').doc(r.id), { status: 'cancelled' });
      if (r.utr) batch.delete(fb.db.collection('utrs').doc(r.utr));
      try { await batch.commit(); toast('Reservation cancelled.'); }
      catch (err) { console.error('[Eveora] Cancel failed', err); toast('Could not cancel. Please try again.'); }
    });
  }

  /* ---------- Payment proof viewer ---------- */
  async function showProof(id) {
    const r = adminRegs.find((x) => x.id === id) || myRegs.find((x) => x.id === id);
    const body = $('#proofBody');
    body.innerHTML = '<div class="proof-loading"><span class="spinner"></span> Loading screenshot…</div>';
    openModal($('#proofModal'));
    try {
      const doc = await fb.db.collection('paymentProofs').doc(id).get();
      const data = doc.exists ? doc.data().image : '';
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('missing');
      body.innerHTML = `
        <span class="eyebrow">Payment proof</span>
        <h3 id="proofTitle">${r ? escapeHTML(r.name) : 'Screenshot'}</h3>
        <p class="proof-meta">${r ? `${escapeHTML(r.eventName)} · ${rupees(r.amount)} · UTR <strong>${escapeHTML(r.utr)}</strong>` : ''}</p>`;
      const img = document.createElement('img');
      img.className = 'proof-img';
      img.alt = 'Payment screenshot';
      img.src = data;
      body.appendChild(img);
    } catch (e) {
      body.innerHTML = `<div class="empty-state">${ic('image')}<h3>Screenshot unavailable</h3><p>It could not be loaded.</p></div>`;
    }
  }

  /* ---------- Admin: payment verification ---------- */
  const ADMIN_FILTERS = ['pending', 'approved', 'rejected', 'cancelled', 'all'];
  const newTicketId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return 'EV-' + id;
  };

  function reviewActions(r) {
    if (r.status === 'pending') {
      return `<button class="btn btn-ghost btn-sm" data-review="reject" data-id="${r.id}">Reject</button>
              <button class="btn btn-primary btn-sm" data-review="approve" data-id="${r.id}">${ic('check')} Approve &amp; issue ticket</button>`;
    }
    if (r.status === 'approved') return `<button class="btn btn-ghost btn-sm" data-review="pending" data-id="${r.id}">Undo approval</button>`;
    if (r.status === 'rejected') return `<button class="btn btn-outline btn-sm" data-review="pending" data-id="${r.id}">Reopen</button>`;
    return '';
  }

  function reviewCardHTML(r, utrCount, i) {
    const ev = getEvent(r.eventId);
    const expected = ev ? ev.price * r.tickets : r.amount;
    const mismatch = ev && expected !== r.amount;
    const dup = r.utr && utrCount[r.utr] > 1;
    return `
      <article class="review-card" data-status="${r.status}" style="animation-delay:${Math.min(i, 8) * 40}ms">
        <div class="rc-head">
          <div>
            <h4>${escapeHTML(r.eventName || (ev && ev.name) || r.eventId)}</h4>
            <p>${ev ? `${formatDate(ev.date)} · ` : ''}${r.tickets} guest${r.tickets > 1 ? 's' : ''}${ev ? ` · ${seatsLeft(ev)} seats available` : ''}</p>
          </div>
          ${statusBadge(r.status)}
        </div>
        <div class="rc-grid">
          <div><small>Guest</small><strong>${escapeHTML(r.name)}</strong></div>
          <div><small>Email</small><strong>${escapeHTML(r.email)}</strong></div>
          <div><small>Phone</small><strong>${escapeHTML(r.phone)}</strong></div>
          <div><small>Amount</small><strong>${r.amount ? rupees(r.amount) : 'Complimentary'}</strong>${mismatch ? `<em class="warn">Expected ${rupees(expected)}</em>` : ''}</div>
          <div><small>UTR</small>${r.utr ? `<code>${escapeHTML(r.utr)}</code><button class="copy-btn" data-copy="${escapeHTML(r.utr)}" aria-label="Copy UTR">${ic('copy')}</button>` : '<strong>—</strong>'}${dup ? '<em class="warn">Used in more than one booking</em>' : ''}</div>
          <div><small>Submitted</small><strong>${formatStamp(r.createdAt)}</strong></div>
        </div>
        ${r.status === 'rejected' && r.rejectReason ? `<p class="rc-note">Reason: ${escapeHTML(r.rejectReason)}</p>` : ''}
        ${r.status === 'approved' && r.ticketId ? `<p class="rc-meta">Ticket ${escapeHTML(r.ticketId)} issued</p>` : ''}
        ${r.reviewedBy ? `<p class="rc-meta">Reviewed by ${escapeHTML(r.reviewedBy)} · ${formatStamp(r.reviewedAt)}</p>` : ''}
        <div class="rc-actions">
          ${r.hasProof ? `<button class="btn btn-outline btn-sm" data-proof="${r.id}">${ic('image')} View screenshot</button>` : '<span class="rc-meta">No payment required</span>'}
          <span class="spacer"></span>
          ${reviewActions(r)}
        </div>
      </article>`;
  }

  function renderAdmin() {
    const show = !!(currentUser && roles.admin);
    $('#admin').classList.toggle('hidden', !show);
    $('#adminNavLink').classList.toggle('hidden', !show);
    $('#adminManager').classList.toggle('hidden', !(show && roles.superadmin));
    if (!show) return;

    const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    let revenue = 0;
    const utrCount = {};
    adminRegs.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (r.status === 'approved') revenue += r.amount || 0;
      if (r.utr && r.status !== 'cancelled') utrCount[r.utr] = (utrCount[r.utr] || 0) + 1;
    });
    const pendingEvents = renderAdminEvents();
    $('#pendingCount').textContent = counts.pending + pendingEvents;

    $('#adminStats').innerHTML = `
      <div class="stat"><strong>${counts.pending}</strong><span>Awaiting review</span></div>
      <div class="stat"><strong>${counts.approved}</strong><span>Approved</span></div>
      <div class="stat"><strong>${counts.rejected}</strong><span>Rejected</span></div>
      <div class="stat"><strong>${rupees(revenue)}</strong><span>Verified revenue</span></div>`;

    $('#adminFilters').innerHTML = ADMIN_FILTERS.map((f) => `
      <button class="chip ${state.adminFilter === f ? 'active' : ''}" data-filter="${f}">
        ${f === 'all' ? 'All' : STATUS[f].short}${f === 'all' ? '' : ` · ${counts[f] || 0}`}
      </button>`).join('');

    const q = state.adminSearch.trim().toLowerCase();
    const list = adminRegs.filter((r) => (state.adminFilter === 'all' || r.status === state.adminFilter) &&
      (!q || `${r.name} ${r.email} ${r.phone} ${r.utr} ${r.eventName} ${r.ticketId || ''}`.toLowerCase().includes(q)));

    $('#reviewList').innerHTML = list.length
      ? list.map((r, i) => reviewCardHTML(r, utrCount, i)).join('')
      : `<div class="empty-state">${ic('shield')}<h3>All caught up</h3><p>No ${state.adminFilter === 'all' ? '' : STATUS[state.adminFilter].short.toLowerCase() + ' '}registrations${q ? ' match your search' : ''}.</p></div>`;

    renderAdminManager();
  }

  async function reviewRegistration(id, action) {
    const r = adminRegs.find((x) => x.id === id);
    if (!r) return;
    const ev = getEvent(r.eventId);
    let reason = '';

    if (action === 'approve' && ev && r.tickets > seatsLeft(ev)) {
      const ok = await askConfirm({ title: 'Not enough seats', text: `Only ${seatsLeft(ev)} seat(s) remain for ${ev.name}. Approve anyway?`, okLabel: 'Approve anyway' });
      if (ok === false) return;
    }
    if (action === 'reject') {
      reason = await askConfirm({
        title: 'Reject this payment?',
        text: 'Let the guest know what went wrong — they will see this in My Bookings.',
        okLabel: 'Reject payment',
        danger: true,
        input: { placeholder: 'e.g. UTR not found in our account' }
      });
      if (reason === false) return;
    }

    const FV = firebase.firestore.FieldValue;
    const db = fb.db;
    const next = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
    const statsRef = db.collection('eventStats').doc(r.eventId);
    const batch = db.batch();

    batch.update(db.collection('registrations').doc(id), {
      status: next,
      reviewedBy: currentUser.email,
      reviewedAt: FV.serverTimestamp(),
      rejectReason: next === 'rejected' ? reason.slice(0, 200) : FV.delete(),
      ticketId: next === 'approved' ? newTicketId() : FV.delete()
    });
    // Seat counts include approved tickets only
    if (next === 'approved' && r.status !== 'approved') batch.set(statsRef, { booked: FV.increment(r.tickets) }, { merge: true });
    if (r.status === 'approved' && next !== 'approved') batch.set(statsRef, { booked: FV.increment(-r.tickets) }, { merge: true });
    // A rejected UTR is released so the guest can resubmit it; reopening claims it again
    if (r.utr && next === 'rejected') batch.delete(db.collection('utrs').doc(r.utr));
    if (r.utr && r.status === 'rejected' && next === 'pending') batch.set(db.collection('utrs').doc(r.utr), { uid: r.uid, regId: r.id, createdAt: FV.serverTimestamp() });

    try {
      await batch.commit();
      toast(next === 'approved' ? `Approved — ticket issued to ${firstName(r.name)}.` : next === 'rejected' ? 'Payment rejected.' : 'Moved back to pending.');
    } catch (err) {
      console.error('[Eveora] Review failed', err);
      toast(r.status === 'rejected' && err.code === 'permission-denied'
        ? 'That UTR is now attached to another booking.'
        : 'Could not update this booking. Please try again.');
    }
  }

  /* ---------- Event catalog: built-in + published events from Firestore ---------- */
  const SAFE_IMAGE = /^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s"'<>]+)$/;

  // Normalise a Firestore event so it renders exactly like the built-in ones
  const toEvent = (d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    date: d.date,
    venue: d.venue,
    city: d.city,
    price: d.price,
    seats: d.seats,
    image: SAFE_IMAGE.test(d.image || '') ? d.image : '',
    featured: !!d.featured,
    organizer: d.organizer,
    description: d.description,
    highlights: Array.isArray(d.highlights) ? d.highlights : [],
    community: true
  });

  function updateCatalog() {
    EVENTS.splice(0, EVENTS.length, ...BASE_EVENTS, ...liveEvents.map(toEvent));
    if (state.category !== 'All' && !EVENTS.some((e) => e.category === state.category)) state.category = 'All';
    renderChips();
    renderHeroNext();
    renderFeatured();
    renderEvents();
    populateEventSelect();
    updateFormSummary();
    // Keep the hero's "Upcoming events" figure in step with the catalog
    const upcoming = $('.hero-stats strong');
    if (upcoming) upcoming.textContent = EVENTS.filter((e) => !isPast(e)).length;
  }

  function listenPublishedEvents() {
    listen('liveEvents', fb.db.collection('events').where('status', '==', 'published'), (snap) => {
      liveEvents = snap.docs.map(docData);
      updateCatalog();
    });
  }

  function listenMyEvents() {
    listen('myEvents', fb.db.collection('events').where('createdBy', '==', currentUser.uid), (snap) => {
      myEvents = snap.docs.map(docData).sort(byNewest);
      renderMyEvents();
    });
  }

  const eventBadge = (s) => `<span class="status-badge ${EVENT_STATUS[s].cls}">${ic(EVENT_STATUS[s].icon)} ${EVENT_STATUS[s].label}</span>`;

  function renderMyEvents() {
    const box = $('#myEvents');
    if (!currentUser || !myEvents.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<h4>Your events</h4>` + myEvents.map((d) => {
      const ev = toEvent(d);
      return `
        <div class="my-event">
          ${imageHTML(ev)}
          <div>
            <strong>${escapeHTML(ev.name)}</strong>
            <small>${formatDate(ev.date)} · ${escapeHTML(ev.city)}</small>
            ${d.status === 'rejected' && d.rejectReason ? `<span class="reason">${escapeHTML(d.rejectReason)}</span>` : ''}
          </div>
          <div class="my-event-actions">
            ${eventBadge(d.status)}
            ${d.status === 'published' ? `<button class="btn btn-outline btn-sm" data-open="${ev.id}">View</button>` : `<button class="btn btn-ghost btn-sm" data-withdraw="${ev.id}">Withdraw</button>`}
          </div>
        </div>`;
    }).join('');
  }

  /* ---------- Host an event (anyone signed in; admins publish directly) ---------- */
  const hostForm = $('#hostForm');

  const hostValidators = {
    evName(v) { v = v.trim(); return v.length < 3 ? 'Please enter an event name (at least 3 characters).' : ''; },
    evCategory(v) { return EVENT_CATEGORIES.includes(v) ? '' : 'Please choose a category.'; },
    evOrganizer(v) { return v.trim().length < 2 ? 'Please enter who is hosting the event.' : ''; },
    evDate(v) {
      if (!v) return 'Please choose a date and time.';
      if (new Date(v) < new Date()) return 'The event must be in the future.';
      return '';
    },
    evSeats(v) {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 5000 ? '' : 'Seats must be a whole number between 1 and 5,000.';
    },
    evVenue(v) { return v.trim().length < 2 ? 'Please enter the venue.' : ''; },
    evCity(v) { return v.trim().length < 2 ? 'Please enter the city.' : ''; },
    evPrice(v) {
      if (v === '') return 'Please enter a price (0 for complimentary).';
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 100000 ? '' : 'Price must be a whole number from 0 to 1,00,000.';
    },
    evDescription(v) {
      v = v.trim();
      if (v.length < 20) return 'Please describe the event in at least 20 characters.';
      return v.length > 600 ? 'Keep the description under 600 characters.' : '';
    },
    evHighlights(v) {
      const lines = v.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length > 6) return 'Add up to 6 highlights.';
      return lines.some((l) => l.length > 80) ? 'Keep each highlight under 80 characters.' : '';
    }
  };

  function validateHostField(el) {
    const fn = hostValidators[el.name];
    if (!fn) return true;
    const msg = fn(el.value);
    setFieldState(el, msg);
    return !msg;
  }

  function resetHostForm() {
    hostForm.reset();
    eventImage = null;
    const img = $('#evImagePreview');
    img.removeAttribute('src');
    img.hidden = true;
    $('#evImageBox').classList.remove('has-file');
    $$('.form-group', hostForm).forEach((g) => g.classList.remove('valid', 'invalid'));
    $$('.error-msg', hostForm).forEach((m) => { m.textContent = ''; });
  }

  function initHost() {
    $('#evCategory').innerHTML = '<option value="">Choose a category</option>' +
      EVENT_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');

    const fields = $$('input:not([type="file"]):not([type="checkbox"]), select, textarea', hostForm);
    fields.forEach((el) => {
      el.addEventListener('blur', () => validateHostField(el));
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (el.closest('.form-group').classList.contains('invalid')) validateHostField(el);
      });
    });

    $('#evImage').addEventListener('change', async (e) => {
      const input = e.target;
      const file = input.files && input.files[0];
      eventImage = null;
      $('#evImageBox').classList.remove('has-file');
      $('#evImagePreview').hidden = true;
      if (!file) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
        input.value = '';
        setFieldState(input, 'Please choose a JPG, PNG or WebP image up to 10 MB.');
        return;
      }
      $('#evImageBox').classList.add('busy');
      try {
        eventImage = await compressImage(file, 1400, 380000);
        const img = $('#evImagePreview');
        img.src = eventImage;
        img.hidden = false;
        $('#evImageBox').classList.add('has-file');
        setFieldState(input, '');
      } catch (err) {
        input.value = '';
        setFieldState(input, 'That image could not be used. Please try another one.');
      } finally {
        $('#evImageBox').classList.remove('busy');
      }
    });

    hostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) { toast('Please sign in with Google to host an event.'); return; }
      if (!firebaseReady()) { backendMissing(); return; }
      if (!fields.map(validateHostField).every(Boolean)) {
        const firstBad = $('.form-group.invalid input, .form-group.invalid select, .form-group.invalid textarea', hostForm);
        if (firstBad) firstBad.focus();
        toast('Please review the highlighted fields.');
        return;
      }

      const publish = roles.admin;
      const doc = {
        name: hostForm.evName.value.trim(),
        category: hostForm.evCategory.value,
        organizer: hostForm.evOrganizer.value.trim(),
        date: hostForm.evDate.value.slice(0, 16),
        seats: Number(hostForm.evSeats.value),
        venue: hostForm.evVenue.value.trim(),
        city: hostForm.evCity.value.trim(),
        price: Number(hostForm.evPrice.value),
        image: eventImage || '',
        description: hostForm.evDescription.value.trim(),
        highlights: hostForm.evHighlights.value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6),
        featured: publish && hostForm.evFeatured.checked,
        status: publish ? 'published' : 'pending',
        createdBy: currentUser.uid,
        createdByEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (publish) {
        doc.reviewedBy = currentUser.email;
        doc.reviewedAt = firebase.firestore.FieldValue.serverTimestamp();
      }

      const btn = $('#hostSubmit');
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        await fb.db.collection('events').add(doc);
        resetHostForm();
        toast(publish ? 'Your event is now live.' : 'Submitted — our team will review your event shortly.');
      } catch (err) {
        console.error('[Eveora] Event submission failed', err);
        toast('Your event could not be submitted. Please try again.');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });

    $('#myEvents').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-withdraw]');
      if (!btn) return;
      const ok = await askConfirm({ title: 'Withdraw this event?', text: 'It will be removed from review. You can submit it again later.', okLabel: 'Withdraw', danger: true });
      if (ok === false) return;
      try { await fb.db.collection('events').doc(btn.dataset.withdraw).delete(); toast('Event withdrawn.'); }
      catch (err) { console.error('[Eveora] Withdraw failed', err); toast('Could not withdraw this event.'); }
    });
  }

  /* ---------- Admin: event approvals ---------- */
  const EVENT_FILTERS = ['pending', 'published', 'rejected', 'all'];

  function eventReviewHTML(d, i) {
    const ev = toEvent(d);
    const actions = d.status === 'pending'
      ? `<button class="btn btn-ghost btn-sm" data-ev-review="reject" data-id="${ev.id}">Reject</button>
         <button class="btn btn-primary btn-sm" data-ev-review="publish" data-id="${ev.id}">${ic('check')} Approve &amp; publish</button>`
      : d.status === 'published'
        ? `<button class="btn btn-outline btn-sm" data-ev-review="feature" data-id="${ev.id}">${d.featured ? 'Remove from featured' : 'Feature on home page'}</button>
           <button class="btn btn-ghost btn-sm" data-ev-review="unpublish" data-id="${ev.id}">Unpublish</button>`
        : `<button class="btn btn-outline btn-sm" data-ev-review="publish" data-id="${ev.id}">Approve &amp; publish</button>`;
    return `
      <article class="review-card event-review" data-status="${d.status === 'published' ? 'approved' : d.status}" style="animation-delay:${Math.min(i, 8) * 40}ms">
        ${imageHTML(ev)}
        <div>
          <div class="rc-head">
            <div>
              <h4>${escapeHTML(ev.name)}</h4>
              <p>${escapeHTML(ev.category)} · ${formatDate(ev.date)} · ${formatTime(ev.date)}</p>
            </div>
            ${eventBadge(d.status)}
          </div>
          <div class="rc-grid">
            <div><small>Venue</small><strong>${escapeHTML(ev.venue)}, ${escapeHTML(ev.city)}</strong></div>
            <div><small>Price · Seats</small><strong>${formatPrice(ev.price)} · ${ev.seats}</strong></div>
            <div><small>Hosted by</small><strong>${escapeHTML(ev.organizer)}</strong></div>
            <div><small>Submitted by</small><strong>${escapeHTML(d.createdByEmail)}</strong></div>
            <div><small>Submitted</small><strong>${formatStamp(d.createdAt)}</strong></div>
            <div><small>Featured</small><strong>${d.featured ? 'Yes' : 'No'}</strong></div>
          </div>
          <p class="er-desc">${escapeHTML(ev.description)}</p>
          ${d.status === 'rejected' && d.rejectReason ? `<p class="rc-note">Reason: ${escapeHTML(d.rejectReason)}</p>` : ''}
          ${d.reviewedBy ? `<p class="rc-meta">Reviewed by ${escapeHTML(d.reviewedBy)} · ${formatStamp(d.reviewedAt)}</p>` : ''}
          <div class="rc-actions"><span class="spacer"></span>${actions}</div>
        </div>
      </article>`;
  }

  function renderAdminEvents() {
    const counts = { pending: 0, published: 0, rejected: 0 };
    adminEvents.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });
    $('#eventFilters').innerHTML = EVENT_FILTERS.map((f) => `
      <button class="chip ${state.eventFilter === f ? 'active' : ''}" data-ev-filter="${f}">
        ${f === 'all' ? 'All' : EVENT_STATUS[f].short}${f === 'all' ? '' : ` · ${counts[f] || 0}`}
      </button>`).join('');
    const list = adminEvents.filter((d) => state.eventFilter === 'all' || d.status === state.eventFilter);
    $('#eventReviewList').innerHTML = list.length
      ? list.map(eventReviewHTML).join('')
      : `<div class="empty-state">${ic('calendar')}<h3>Nothing to review</h3><p>No ${state.eventFilter === 'all' ? '' : EVENT_STATUS[state.eventFilter].short.toLowerCase() + ' '}events right now.</p></div>`;
    return counts.pending;
  }

  async function reviewEvent(id, action) {
    const d = adminEvents.find((x) => x.id === id);
    if (!d) return;
    const FV = firebase.firestore.FieldValue;
    const ref = fb.db.collection('events').doc(id);
    let update;

    if (action === 'feature') {
      update = { featured: !d.featured };
    } else if (action === 'publish') {
      update = { status: 'published', reviewedBy: currentUser.email, reviewedAt: FV.serverTimestamp(), rejectReason: FV.delete() };
    } else {
      const reason = await askConfirm({
        title: action === 'reject' ? 'Reject this event?' : 'Unpublish this event?',
        text: 'Tell the organiser why — they will see this message.',
        okLabel: action === 'reject' ? 'Reject event' : 'Unpublish',
        danger: true,
        input: { placeholder: 'e.g. Please add the venue address and a clearer cover image' }
      });
      if (reason === false) return;
      update = { status: 'rejected', reviewedBy: currentUser.email, reviewedAt: FV.serverTimestamp(), rejectReason: reason.slice(0, 200), featured: false };
    }

    try {
      await ref.update(update);
      toast(action === 'publish' ? `“${d.name}” is now live.` : action === 'feature' ? 'Featured setting updated.' : 'The organiser has been notified.');
    } catch (err) {
      console.error('[Eveora] Event review failed', err);
      toast('Could not update this event. Please try again.');
    }
  }

  /* ---------- Admin: team management (superadmin) ---------- */
  function renderAdminManager() {
    if (!roles.superadmin) return;
    const row = (email, sub, action) => `
      <li><span class="avatar">${escapeHTML(email.charAt(0).toUpperCase())}</span>
        <div><strong>${escapeHTML(email)}</strong><small>${sub}</small></div>${action}</li>`;
    $('#adminList').innerHTML =
      row(SUPERADMIN, 'Full access · manages the admin team', '<span class="role-badge">Superadmin</span>') +
      adminList.map((a) => row(a.email,
        `Admin · added by ${escapeHTML(a.addedBy || '')}${tsDate(a.addedAt) ? ' on ' + tsDate(a.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`,
        `<button class="btn btn-ghost btn-sm" data-remove-admin="${escapeHTML(a.email)}">Remove</button>`)).join('');
  }

  function initAdmin() {
    $('#adminFilters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      state.adminFilter = chip.dataset.filter;
      renderAdmin();
    });

    let debounce;
    $('#adminSearch').addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { state.adminSearch = e.target.value; renderAdmin(); }, 200);
    });

    $('#reviewList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-review]');
      if (btn) reviewRegistration(btn.dataset.id, btn.dataset.review);
    });

    $('#eventFilters').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-ev-filter]');
      if (!chip) return;
      state.eventFilter = chip.dataset.evFilter;
      renderAdminEvents();
    });
    $('#eventReviewList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ev-review]');
      if (btn) reviewEvent(btn.dataset.id, btn.dataset.evReview);
    });

    $('#addAdminForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#newAdminEmail');
      const err = $('#addAdminError');
      const email = input.value.trim().toLowerCase();
      err.textContent = '';
      if (!/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/.test(email)) { err.textContent = 'Please enter a valid email address.'; return; }
      if (email === SUPERADMIN) { err.textContent = 'This account is already the superadmin.'; return; }
      if (adminList.some((a) => a.email === email)) { err.textContent = 'This person is already an admin.'; return; }
      try {
        await fb.db.collection('admins').doc(email).set({
          email,
          addedBy: currentUser.email,
          addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        toast(`${email} is now an admin.`);
      } catch (ex) {
        console.error('[Eveora] Add admin failed', ex);
        err.textContent = 'Could not add this admin. Please try again.';
      }
    });

    $('#adminList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-remove-admin]');
      if (!btn) return;
      const email = btn.dataset.removeAdmin;
      const ok = await askConfirm({ title: 'Remove admin?', text: `${email} will no longer be able to verify payments.`, okLabel: 'Remove', danger: true });
      if (ok === false) return;
      try { await fb.db.collection('admins').doc(email).delete(); toast(`${email} was removed.`); }
      catch (ex) { console.error('[Eveora] Remove admin failed', ex); toast('Could not remove this admin.'); }
    });
  }

  /* ---------- Scroll effects ---------- */
  function initScrollEffects() {
    const navbar = $('#navbar');
    const topBtn = $('#backToTop');
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 30);
      topBtn.classList.toggle('show', window.scrollY > 700);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    $$('.reveal').forEach((el) => io.observe(el));

    $$('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / 1600, 1);
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
    renderAdmin();
  }

  function init() {
    $('#year').textContent = new Date().getFullYear();
    $('[data-count="12"]').dataset.count = EVENTS.filter((e) => !isPast(e)).length;
    $('[data-count="8"]').dataset.count = new Set(EVENTS.map((e) => e.city)).size;

    const ready = initFirebase();
    initTheme();
    initAuth();
    initNavbar();
    renderChips();
    renderHeroNext();
    refreshAll();
    initFilters();
    initModals();
    initForm();
    initProofUpload();
    initBookings();
    initAdmin();
    initHost();
    initScrollEffects();
    setInterval(updateCountdowns, 1000);

    if (ready) {
      listenStats();
      listenPublishedEvents();
      fb.auth.onAuthStateChanged(onAuthChanged);
    } else {
      console.warn('[Eveora] Firebase is not configured – browsing only.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
