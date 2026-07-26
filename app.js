const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const SCHOOL_LABELS = {
  Millennium: 'ミレニアム',
  Trinity: 'トリニティ',
  Gehenna: 'ゲヘナ',
  WildHunt: 'ワイルドハント',
  Hyakkiyako: '百鬼夜行',
  RedWinter: 'レッドウィンター',
  Highlander: 'ハイランダー',
  Abydos: 'アビドス',
  Shanhaijing: '山海経',
  Arius: 'アリウス',
  Valkyrie: 'ヴァルキューレ',
  SRT: 'SRT',
  Tokiwadai: '常盤台',
  ETC: 'その他'
};

const mobileQuery = window.matchMedia('(max-width: 672px)');
// Rows are sized to the viewport, so fewer tags fit on a phone.
const maxVisible = () => (mobileQuery.matches ? 1 : 3);

// Map of "MM-DD" -> [{ summary, name, school, ... }]
let byDay = new Map();
let schools = {};
let view = new Date();
let query = '';

/* ---- ICS parsing ---- */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(value) {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

function parseICS(text) {
  const events = [];
  let current = null;
  let depth = 0;
  for (const line of unfold(text).split('\n')) {
    if (line === 'BEGIN:VEVENT') { current = {}; depth = 0; continue; }
    if (line === 'END:VEVENT') {
      if (current && current.start) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    // Skip nested components (VALARM) — their DESCRIPTION isn't the event's.
    if (line.startsWith('BEGIN:')) { depth++; continue; }
    if (line.startsWith('END:')) { depth--; continue; }
    if (depth > 0) continue;

    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const prop = line.slice(0, sep);
    const value = line.slice(sep + 1);
    const key = prop.split(';')[0].toUpperCase();
    if (key === 'DTSTART') {
      const digits = value.replace(/[^0-9]/g, '').slice(0, 8);
      if (digits.length === 8) {
        current.start = {
          year: +digits.slice(0, 4),
          month: +digits.slice(4, 6),
          day: +digits.slice(6, 8)
        };
      }
    } else if (key === 'SUMMARY') {
      current.summary = unescapeText(value);
    } else if (key === 'DESCRIPTION') {
      current.description = unescapeText(value);
    } else if (key === 'RRULE') {
      current.rrule = value;
    }
  }
  return events;
}

function indexEvents(events) {
  const map = new Map();
  for (const ev of events) {
    const key = String(ev.start.month).padStart(2, '0') + '-' + String(ev.start.day).padStart(2, '0');
    if (!map.has(key)) map.set(key, []);
    const name = ev.description || ev.summary || '';
    map.get(key).push({
      summary: ev.summary || '(無題)',
      name,
      school: schools[name] || null,
      yearly: /FREQ=YEARLY/i.test(ev.rrule || ''),
      month: ev.start.month,
      day: ev.start.day,
      year: ev.start.year
    });
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.summary.localeCompare(b.summary, 'ja'));
  }
  return map;
}

/* ---- Lookup helpers ---- */
function eventsFor(date) {
  const key = String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const list = byDay.get(key) || [];
  // Non-recurring events only show in their original year.
  return list.filter(e => e.yearly || e.year === date.getFullYear());
}

function matchesQuery(ev) {
  if (!query) return true;
  const school = ev.school ? ev.school + ' ' + (SCHOOL_LABELS[ev.school] || '') : '';
  return (ev.summary + ' ' + ev.name + ' ' + school).toLowerCase().includes(query);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function countMatches(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    n += eventsFor(new Date(year, month, d)).filter(matchesQuery).length;
  }
  return n;
}

function schoolClass(ev) {
  return ev.school ? ' event--' + ev.school : '';
}

/* ---- Rendering ---- */
function render() {
  const year = view.getFullYear();
  const month = view.getMonth();
  const today = new Date();

  document.getElementById('monthLabel').innerHTML =
    MONTHS[month] + '<span class="year">' + year + '</span>';

  const cal = document.getElementById('calendar');
  cal.textContent = '';

  for (let i = 0; i < 7; i++) {
    const el = document.createElement('div');
    el.className = 'weekday' + (i === 0 ? ' weekday--sun' : i === 6 ? ' weekday--sat' : '');
    el.textContent = WEEKDAYS[i];
    cal.appendChild(el);
  }

  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7);

  // Week rows share the leftover height equally, so the page never scrolls.
  cal.style.gridTemplateRows = 'auto repeat(' + weeks + ', minmax(0, 1fr))';

  let monthTotal = 0;

  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const outside = date.getMonth() !== month;
    const events = eventsFor(date);
    if (!outside) monthTotal += events.length;

    const cell = document.createElement('div');
    cell.className = 'day' +
      (outside ? ' day--outside' : '') +
      (sameDay(date, today) ? ' day--today' : '');

    const num = document.createElement('div');
    num.className = 'day__num';
    num.textContent = String(date.getDate()).padStart(2, '0');
    cell.appendChild(num);

    const limit = maxVisible();
    events.slice(0, limit).forEach(ev => {
      const tag = document.createElement('div');
      tag.className = 'event' + schoolClass(ev) + (matchesQuery(ev) ? '' : ' event--dim');
      tag.textContent = ev.name || ev.summary;
      tag.title = ev.name + (ev.school ? ' · ' + (SCHOOL_LABELS[ev.school] || ev.school) : '');
      cell.appendChild(tag);
    });

    // Hidden events are only reachable through the panel.
    if (events.length > limit) {
      const more = document.createElement('button');
      more.className = 'day__more';
      more.textContent = '他 ' + (events.length - limit) + ' 件';
      more.addEventListener('click', () => openPanel(date));
      cell.appendChild(more);
    }

    cal.appendChild(cell);
  }

  document.getElementById('monthCaption').textContent = query
    ? countMatches(year, month) + ' 件が「' + query + '」に一致 / 今月 ' + monthTotal + ' 件'
    : monthTotal + ' 件の誕生日';
}

/* ---- Side panel (overflow days only) ---- */
function openPanel(date) {
  const panel = document.getElementById('panel');
  const events = eventsFor(date);
  document.getElementById('panelTitle').textContent =
    (date.getMonth() + 1) + '月' + date.getDate() + '日';
  document.getElementById('panelSub').textContent =
    date.getFullYear() + ' · ' + WEEKDAYS[date.getDay()] + '曜日 · ' + events.length + ' 件';

  const body = document.getElementById('panelBody');
  body.textContent = '';
  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'この日の誕生日はありません。';
    body.appendChild(empty);
  }
  events.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'item';
    if (ev.school) item.style.setProperty('--accent', 'var(--school-' + ev.school + ')');
    const name = document.createElement('div');
    name.className = 'item__name';
    name.textContent = ev.name || ev.summary;
    const meta = document.createElement('div');
    meta.className = 'item__meta';
    meta.textContent = (ev.school ? (SCHOOL_LABELS[ev.school] || ev.school) + ' · ' : '') +
      (ev.yearly ? '毎年' : ev.year + '年');
    item.appendChild(name);
    item.appendChild(meta);
    body.appendChild(item);
  });

  panel.classList.add('panel--open');
  panel.setAttribute('aria-hidden', 'false');
}

function closePanel() {
  const panel = document.getElementById('panel');
  panel.classList.remove('panel--open');
  panel.setAttribute('aria-hidden', 'true');
}

/* ---- Mobile search view ---- */
function renderResults() {
  const body = document.getElementById('searchResults');
  body.textContent = '';

  const all = [];
  for (const list of byDay.values()) {
    for (const ev of list) if (matchesQuery(ev)) all.push(ev);
  }
  all.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, 'ja'));

  if (!query) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '生徒名または学校名で検索します。';
    body.appendChild(empty);
    return;
  }
  if (!all.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '「' + query + '」に一致する生徒はいません。';
    body.appendChild(empty);
    return;
  }

  all.forEach(ev => {
    const row = document.createElement('button');
    row.className = 'result';
    if (ev.school) row.style.setProperty('--accent', 'var(--school-' + ev.school + ')');

    const text = document.createElement('span');
    const name = document.createElement('span');
    name.textContent = ev.name;
    const school = document.createElement('span');
    school.className = 'result__school';
    school.textContent = ev.school ? (SCHOOL_LABELS[ev.school] || ev.school) : '';
    text.appendChild(name);
    text.appendChild(school);

    const date = document.createElement('span');
    date.className = 'result__date';
    date.textContent = ev.month + '月' + ev.day + '日';

    row.appendChild(text);
    row.appendChild(date);
    // Jump the calendar to that month and return to it.
    row.addEventListener('click', () => {
      view = new Date(view.getFullYear(), ev.month - 1, 1);
      render();
      closeSearch();
    });
    body.appendChild(row);
  });
}

function openSearch() {
  const v = document.getElementById('searchView');
  v.classList.add('search-view--open');
  v.setAttribute('aria-hidden', 'false');
  const input = document.getElementById('searchInput');
  input.value = query;
  renderResults();
  input.focus();
}

function closeSearch() {
  const v = document.getElementById('searchView');
  v.classList.remove('search-view--open');
  v.setAttribute('aria-hidden', 'true');
}

function setQuery(value) {
  query = value.trim().toLowerCase();
  render();
  renderResults();
}

/* ---- Wiring ---- */
document.getElementById('prev').addEventListener('click', () => {
  view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  render();
});
document.getElementById('next').addEventListener('click', () => {
  view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  render();
});
document.getElementById('today').addEventListener('click', () => {
  view = new Date();
  render();
});
document.getElementById('panelClose').addEventListener('click', closePanel);
document.getElementById('searchOpen').addEventListener('click', openSearch);
document.getElementById('searchClose').addEventListener('click', closeSearch);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePanel(); closeSearch(); }
});

const desktopSearch = document.getElementById('search');
const mobileSearch = document.getElementById('searchInput');
desktopSearch.addEventListener('input', e => {
  mobileSearch.value = e.target.value;
  setQuery(e.target.value);
});
mobileSearch.addEventListener('input', e => {
  desktopSearch.value = e.target.value;
  setQuery(e.target.value);
});

// Re-render when crossing the breakpoint so the per-cell cap follows.
mobileQuery.addEventListener('change', () => {
  closeSearch();
  render();
});

/* ---- Load ---- */
// Schools are optional: without them the calendar still works, just uncolored.
Promise.all([
  fetch('birthdays.ics').then(res => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }),
  fetch('schools.json').then(res => (res.ok ? res.json() : {})).catch(() => ({}))
])
  .then(([ics, schoolMap]) => {
    schools = schoolMap;
    byDay = indexEvents(parseICS(ics));
    render();
  })
  .catch(err => {
    document.getElementById('notice').classList.add('notification--show');
    document.getElementById('noticeBody').innerHTML =
      err.message + ' — <code>file://</code> では fetch がブロックされます。' +
      'プロジェクトのルートで <code>python3 -m http.server 8000</code> を実行し、' +
      '<code>http://localhost:8000</code> を開いてください。';
    render();
  });
