/**
 * Oppmøteregistrering på nettsiden.
 * Data hentes fra og lagres i Google-regnearket via Apps Script-API-et (apps-script/Code.gs, doPost).
 * Uten PUBLIC_REGISTRATION_URL kjører skjemaet med lokale testdata (demo).
 */

const ICON_SEARCH = '<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const ICON_CLEAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_CHEVRON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const ICON_CHECK = '<svg class="check" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/* ---------------- API ---------------- */

function createApi(endpoint) {
  if (endpoint) {
    const post = async (body) => {
      // text/plain unngår CORS-preflight, som Apps Script ikke støtter.
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Fikk ikke kontakt med registreringen. Prøv igjen.');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Noe gikk galt.');
      return json.data;
    };
    return {
      demo: false,
      getInitialData: (pin) => post({ action: 'init', pin }),
      register: (payload) => post({ action: 'register', ...payload }),
    };
  }

  // Demo med testdata
  const members = ['Anders Aune', 'Berit Bakken', 'Eirik Dahl', 'Hanne Fjeld', 'Jonas Grøtte', 'Kari Nordmann',
    'Kristian Berg', 'Kristine Moen', 'Lars Haugen', 'Marte Lien', 'Nils Øvergård', 'Ola Kristiansen',
    'Per Ås', 'Silje Hammer', 'Tor Ekre', 'Åse Vik'].sort((a, b) => a.localeCompare(b, 'nb'));
  const leaders = ['Kari Nordmann', 'Lars Haugen', 'Tor Ekre'];
  const pad = (n) => String(n).padStart(2, '0');
  const now = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const d = new Date();
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let session = new URLSearchParams(location.search).get('state') === 'husket' ? { name: 'Kari Nordmann', setAt: '17:58' } : null;
  const regs = [];
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 300));
  return {
    demo: true,
    getInitialData: () => delay({ today, members, leaders, todayLeader: session, registeredToday: regs.length }),
    register: (p) => {
      if (!session && !p.leader) return delay({ status: 'needLeader' });
      if (!session) session = { name: p.leader, setAt: now() };
      else if (p.changeLeader && p.leader) session = { name: p.leader, setAt: session.setAt };
      if (regs.includes(p.name.toLowerCase())) return delay({ status: 'already', name: p.name, leader: session.name });
      regs.push(p.name.toLowerCase());
      return delay({ status: 'ok', name: p.name, time: now(), leader: session.name });
    },
  };
}

const readPin = () => { try { return localStorage.getItem('nssl-pin') || ''; } catch { return ''; } };
const savePin = (v) => { try { localStorage.setItem('nssl-pin', v); } catch { /* ignorer */ } };

/* ---------------- Combobox: søk og liste i ett felt ---------------- */

let comboCount = 0;

class Combobox {
  constructor(mount, opts) {
    const id = `combo${++comboCount}`;
    this.opts = opts;
    this.options = [];
    this.value = null;
    this.activeIndex = -1;
    this.filtered = [];
    mount.innerHTML = `
      <div class="combo">
        <label class="reg-label" for="${id}"></label>
        <div class="textbox">${ICON_SEARCH}
          <input id="${id}" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="${id}-list" autocomplete="off" autocapitalize="words" spellcheck="false">
          <button type="button" class="icon-btn clear" aria-label="Tøm feltet" hidden>${ICON_CLEAR}</button>
          <button type="button" class="icon-btn toggle" aria-label="Vis hele listen" tabindex="-1">${ICON_CHEVRON}</button>
        </div>
        <div class="field-error" hidden></div>
        <div class="panel" hidden>
          <div class="panel-head" aria-live="polite"></div>
          <ul class="listbox" role="listbox" id="${id}-list"></ul>
          ${opts.footer ? `<div class="panel-foot">${opts.footer.text} <button type="button" class="text-btn foot-link">${opts.footer.link}</button></div>` : ''}
        </div>
      </div>`;
    this.root = mount.firstElementChild;
    this.input = this.root.querySelector('input');
    this.box = this.root.querySelector('.textbox');
    this.panel = this.root.querySelector('.panel');
    this.head = this.root.querySelector('.panel-head');
    this.list = this.root.querySelector('.listbox');
    this.clearBtn = this.root.querySelector('.clear');
    this.error = this.root.querySelector('.field-error');
    this.root.querySelector('label').textContent = opts.label;
    this.input.placeholder = opts.placeholder;
    this.bind();
  }

  bind() {
    const i = this.input;
    i.addEventListener('input', () => {
      this.setError('');
      this.value = this.exactMatch(i.value);
      this.clearBtn.hidden = !i.value;
      this.open();
    });
    i.addEventListener('focus', () => { if (i.value) this.open(); });
    i.addEventListener('click', () => this.open());
    i.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (this.panel.hidden) this.open(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter' && !this.panel.hidden && this.filtered.length) {
        e.preventDefault();
        this.select(this.filtered[Math.max(this.activeIndex, 0)]);
      } else if (e.key === 'Escape') this.close();
    });
    i.addEventListener('blur', () => {
      setTimeout(() => {
        if (this.root.contains(document.activeElement)) return;
        this.close();
        const m = this.exactMatch(i.value);
        if (m) { this.value = m; i.value = m; }
      }, 120);
    });
    const toggle = this.root.querySelector('.toggle');
    toggle.addEventListener('mousedown', (e) => e.preventDefault());
    toggle.addEventListener('click', () => { if (this.panel.hidden) { i.focus(); this.open(true); } else this.close(); });
    this.clearBtn.addEventListener('click', () => { this.clear(); i.focus(); this.open(true); });
    this.list.addEventListener('mousedown', (e) => e.preventDefault());
    this.list.addEventListener('click', (e) => {
      const li = e.target.closest('.option');
      if (li) this.select(li.dataset.value);
    });
    const foot = this.root.querySelector('.foot-link');
    if (foot) {
      foot.addEventListener('mousedown', (e) => e.preventDefault());
      foot.addEventListener('click', () => { const t = i.value; this.close(); this.opts.footer.onClick(t); });
    }
  }

  setOptions(list) { this.options = list.slice(); }

  exactMatch(text) {
    const t = text.trim().toLowerCase();
    return this.options.find((o) => o.toLowerCase() === t) || null;
  }

  rank(q) {
    q = q.trim().toLowerCase();
    if (!q) return this.options.slice();
    const starts = [], words = [], contains = [];
    for (const o of this.options) {
      const l = o.toLowerCase(), at = l.indexOf(q);
      if (at === 0) starts.push(o);
      else if (at > 0 && (l.includes(` ${q}`) || l.includes(`-${q}`))) words.push(o);
      else if (at > 0) contains.push(o);
    }
    return [...starts, ...words, ...contains];
  }

  open(showAll = false) {
    const q = showAll ? '' : this.input.value;
    this.filtered = this.rank(q);
    this.activeIndex = this.filtered.length && q ? 0 : -1;
    this.render(q.trim());
    this.panel.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.panel.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  render(q) {
    this.head.textContent = q
      ? (this.filtered.length === 1 ? '1 treff' : `${this.filtered.length} treff`)
      : `${this.opts.allLabel} (${this.options.length}) · skriv for å filtrere`;
    this.list.innerHTML = '';
    if (!this.filtered.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = `Ingen treff på «${q}».`;
      this.list.appendChild(empty);
      return;
    }
    const ql = q.toLowerCase();
    this.filtered.forEach((o, idx) => {
      const li = document.createElement('li');
      li.className = `option${idx === this.activeIndex ? ' active' : ''}`;
      li.id = `${this.input.id}-opt${idx}`;
      li.setAttribute('role', 'option');
      li.dataset.value = o;
      li.setAttribute('aria-selected', o === this.value ? 'true' : 'false');
      const name = document.createElement('span');
      name.className = 'name';
      const at = ql ? o.toLowerCase().indexOf(ql) : -1;
      if (at >= 0) {
        name.append(o.slice(0, at));
        const m = document.createElement('mark');
        m.textContent = o.slice(at, at + q.length);
        name.append(m, o.slice(at + q.length));
      } else {
        name.textContent = o;
      }
      li.appendChild(name);
      li.insertAdjacentHTML('beforeend', ICON_CHECK);
      this.list.appendChild(li);
    });
    this.syncActive();
  }

  move(d) {
    if (!this.filtered.length) return;
    this.activeIndex = (this.activeIndex + d + this.filtered.length) % this.filtered.length;
    this.list.querySelectorAll('.option').forEach((el, idx) => el.classList.toggle('active', idx === this.activeIndex));
    this.syncActive();
  }

  syncActive() {
    const el = this.activeIndex >= 0 ? this.list.querySelector(`#${this.input.id}-opt${this.activeIndex}`) : null;
    if (el) { this.input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
    else this.input.removeAttribute('aria-activedescendant');
  }

  select(v) {
    this.value = v;
    this.input.value = v;
    this.clearBtn.hidden = false;
    this.setError('');
    this.close();
  }

  clear() { this.value = null; this.input.value = ''; this.clearBtn.hidden = true; this.setError(''); }

  setError(msg) {
    this.error.textContent = msg;
    this.error.hidden = !msg;
    this.box.classList.toggle('invalid', !!msg);
  }
}

/* ---------------- Skjema ---------------- */

export function initRegistration(root) {
  if (!root) return;
  const api = createApi(root.dataset.api);
  const $ = (id) => root.querySelector(`#${id}`);
  const state = { data: null, changingLeader: false, timer: null };
  const typeInput = (v) => root.querySelector(`input[name=type][value=${v}]`);
  const currentType = () => root.querySelector('input[name=type]:checked').value;

  const memberCombo = new Combobox($('memberBlock'), {
    label: 'Medlemsnavn', placeholder: 'Søk eller velg navn', allLabel: 'Alle medlemmer',
    footer: {
      text: 'Finner du ikke navnet ditt?', link: 'Registrer deg som gjest',
      onClick: (typed) => { typeInput('gjest').checked = true; setType('gjest'); $('guestName').value = typed || ''; $('guestName').focus(); },
    },
  });
  const invitedCombo = new Combobox($('invitedBlock'), { label: 'Invitert av (valgfritt)', placeholder: 'Søk eller velg medlem', allLabel: 'Alle medlemmer' });
  const leaderCombo = new Combobox($('leaderCombo'), { label: 'Skyteleder', placeholder: 'Søk eller velg skyteleder', allLabel: 'Alle skyteledere' });

  function setType(t) {
    $('memberBlock').hidden = t !== 'medlem';
    $('guestBlock').hidden = t !== 'gjest';
    hideAlert();
  }
  root.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => setType(r.value)));

  const formatDate = (iso, weekday) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('nb-NO', weekday ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
  };

  function renderLeader() {
    const tl = state.data.todayLeader;
    const remembered = tl && !state.changingLeader;
    $('leaderRemembered').hidden = !remembered;
    $('leaderPick').hidden = !!remembered;
    $('cancelChange').hidden = !(tl && state.changingLeader);
    $('leaderHelp').hidden = !!(tl && state.changingLeader);
    if (tl) {
      $('leaderName').textContent = tl.name;
      $('leaderSetAt').textContent = `Valgt kl. ${tl.setAt} – gjelder hele treningen`;
    }
  }

  $('changeLeader').addEventListener('click', () => {
    state.changingLeader = true;
    leaderCombo.clear();
    renderLeader();
    leaderCombo.input.focus();
    leaderCombo.open(true);
  });
  $('cancelChange').addEventListener('click', () => { state.changingLeader = false; leaderCombo.clear(); renderLeader(); });

  function applyData(data) {
    state.data = data;
    memberCombo.setOptions(data.members);
    invitedCombo.setOptions(data.members);
    leaderCombo.setOptions(data.leaders);
    const lead = document.getElementById('lead');
    if (lead) lead.textContent = `Skytetrening ${formatDate(data.today, true)}. Skyteleder velges av første skytter og huskes resten av dagen.`;
    $('dateText').textContent = formatDate(data.today, false);
    renderLeader();
  }

  function resetForm() {
    memberCombo.clear(); invitedCombo.clear(); leaderCombo.clear();
    $('guestName').value = '';
    $('confirm').checked = false;
    typeInput('medlem').checked = true;
    setType('medlem');
    state.changingLeader = false;
    $('guestError').hidden = true;
    $('confirmError').hidden = true;
    $('guestBox').classList.remove('invalid');
    hideAlert();
  }

  const showAlert = (msg, info) => { const a = $('formAlert'); a.textContent = msg; a.className = `alert${info ? ' info' : ''}`; a.hidden = false; };
  const hideAlert = () => { $('formAlert').hidden = true; };
  const show = (view) => ['loadingView', 'pinView', 'formView', 'successView'].forEach((v) => { $(v).hidden = v !== view; });

  function validate() {
    let first = null;
    const type = currentType();
    if (type === 'medlem' && !memberCombo.value) {
      memberCombo.setError(memberCombo.input.value ? 'Velg navnet ditt fra listen.' : 'Søk opp og velg navnet ditt.');
      first ||= memberCombo.input;
    }
    if (type === 'gjest') {
      const err = $('guestName').value.trim() ? '' : 'Skriv inn navnet på gjesten.';
      $('guestError').textContent = err; $('guestError').hidden = !err; $('guestBox').classList.toggle('invalid', !!err);
      if (err) first ||= $('guestName');
      if (invitedCombo.input.value && !invitedCombo.value) { invitedCombo.setError('Velg et medlem fra listen, eller tøm feltet.'); first ||= invitedCombo.input; }
    }
    if ((!state.data.todayLeader || state.changingLeader) && !leaderCombo.value) {
      leaderCombo.setError('Velg dagens skyteleder.');
      first ||= leaderCombo.input;
    }
    $('confirmError').hidden = $('confirm').checked;
    if (!$('confirm').checked) first ||= $('confirm');
    if (first) first.focus();
    return !first;
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    if (!validate()) return;
    const type = currentType();
    const btn = $('submitBtn');
    btn.disabled = true; btn.textContent = 'Registrerer …';
    try {
      const res = await api.register({
        pin: readPin(),
        type,
        name: type === 'medlem' ? memberCombo.value : $('guestName').value.trim(),
        invitedBy: type === 'gjest' ? (invitedCombo.value || '') : '',
        leader: leaderCombo.value || '',
        changeLeader: state.changingLeader,
      });
      if (res.status === 'ok') showSuccess(res);
      else if (res.status === 'already') showAlert(`${res.name} er allerede registrert på dagens trening.`, true);
      else if (res.status === 'needLeader') { state.data.todayLeader = null; renderLeader(); leaderCombo.setError('Velg dagens skyteleder.'); }
    } catch (err) {
      handleError(err);
    } finally {
      btn.disabled = false; btn.textContent = 'Registrer tilstedeværelse';
    }
  });

  function showSuccess(res) {
    $('successTitle').textContent = `Takk, ${res.name.split(' ')[0]}!`;
    $('successText').textContent = `Du er registrert på dagens trening kl. ${res.time}. Skyteleder: ${res.leader}.`;
    show('successView');
    $('nextBtn').focus();
    let left = 6;
    clearInterval(state.timer);
    const tick = () => {
      left -= 1;
      $('countdown').textContent = `Skjemaet nullstilles om ${left} sekunder.`;
      if (left <= 0) next();
    };
    tick();
    state.timer = setInterval(tick, 1000);
  }

  function next() { clearInterval(state.timer); resetForm(); load(); }
  $('nextBtn').addEventListener('click', next);

  function handleError(err) {
    const msg = (err && err.message) || String(err);
    if (msg.includes('PIN_REQUIRED')) { savePin(''); show('pinView'); $('pin').focus(); return; }
    show('formView');
    showAlert(msg.replace(/^(Exception|Error):\s*/, '') || 'Noe gikk galt. Prøv igjen.');
  }

  $('pinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    savePin($('pin').value.trim());
    try {
      applyData(await api.getInitialData(readPin()));
      $('pinError').hidden = true;
      show('formView');
    } catch (err) {
      if (String(err && err.message).includes('PIN_REQUIRED')) { $('pinError').hidden = false; $('pin').select(); }
      else handleError(err);
    }
  });

  async function load() {
    if (!state.data) show('loadingView');
    try {
      applyData(await api.getInitialData(readPin()));
      show('formView');
    } catch (err) {
      if (!state.data && !String(err && err.message).includes('PIN_REQUIRED')) {
        $('loadingView').textContent = (err && err.message) || 'Klarte ikke å laste medlemslisten.';
        return;
      }
      handleError(err);
    }
  }

  load();
}
