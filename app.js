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
  Odyssey: 'オデュッセイア',
  Tokiwadai: '常盤台',
  ETC: 'その他'
};

// Phones get the agenda list instead of the month grid (see styles.css).
const mobileQuery = window.matchMedia('(max-width: 672px)');
// Tags shown per grid cell before the rest move into the panel.
const MAX_VISIBLE = 3;

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
// focusDay (optional) scrolls the phone agenda to that day of the month.
function render(focusDay) {
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

    events.slice(0, MAX_VISIBLE).forEach(ev => {
      const tag = document.createElement('div');
      tag.className = 'event' + schoolClass(ev) + (matchesQuery(ev) ? '' : ' event--dim');
      tag.textContent = ev.name || ev.summary;
      tag.title = ev.name + (ev.school ? ' · ' + (SCHOOL_LABELS[ev.school] || ev.school) : '');
      cell.appendChild(tag);
    });

    // Hidden events are only reachable through the panel.
    if (events.length > MAX_VISIBLE) {
      const more = document.createElement('button');
      more.className = 'day__more';
      more.textContent = '他 ' + (events.length - MAX_VISIBLE) + ' 件';
      more.addEventListener('click', () => openPanel(date));
      cell.appendChild(more);
    }

    cal.appendChild(cell);
  }

  renderAgenda(year, month, today, focusDay);

  document.getElementById('monthCaption').textContent = query
    ? countMatches(year, month) + ' 件が「' + query + '」に一致 / 今月 ' + monthTotal + ' 件'
    : '';
}

/* ---- Agenda list (phones) ---- */
// One row per day with birthdays. Today always gets a row so the list
// shows where "now" is, even on a day with nothing on it.
function renderAgenda(year, month, today, focusDay) {
  const list = document.getElementById('agenda');
  list.textContent = '';
  const days = new Date(year, month + 1, 0).getDate();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let scrollTarget = null;

  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const events = eventsFor(date);
    const isToday = sameDay(date, today);
    if (!events.length && !isToday) continue;

    const cards = events.map(ev => {
      const item = makeItem(ev);
      if (!matchesQuery(ev)) item.classList.add('item--dim');
      return item;
    });
    const row = dayRow(date, isToday, cards);
    list.appendChild(row);

    if (focusDay) {
      if (d === focusDay) scrollTarget = row;
    } else if (!scrollTarget && date >= startOfToday &&
               year === today.getFullYear() && month === today.getMonth()) {
      // In the current month, start the list at today (or the next birthday).
      scrollTarget = row;
    }
  }

  if (!list.children.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '今月の誕生日はありません。';
    list.appendChild(empty);
  }

  list.scrollTop = 0;
  if (scrollTarget) {
    list.scrollTop = scrollTarget.getBoundingClientRect().top - list.getBoundingClientRect().top;
    // Briefly mark the day a search result jumped to.
    if (focusDay) scrollTarget.classList.add('agenda__day--flash');
  }
}

// A date column (number + weekday) beside a stack of cards. Shared by the
// agenda and the search results so both lists read the same way.
function dayRow(date, isToday, cards) {
  const row = document.createElement('section');
  const dow = date.getDay();
  row.className = 'agenda__day' +
    (isToday ? ' agenda__day--today' : '') +
    (dow === 0 ? ' agenda__day--sun' : dow === 6 ? ' agenda__day--sat' : '');

  const head = document.createElement('div');
  head.className = 'agenda__date';
  const num = document.createElement('span');
  num.className = 'agenda__num';
  num.textContent = String(date.getDate()).padStart(2, '0');
  const wd = document.createElement('span');
  wd.className = 'agenda__weekday';
  wd.textContent = isToday ? '今日' : WEEKDAYS[dow];
  head.appendChild(num);
  head.appendChild(wd);
  row.appendChild(head);

  const items = document.createElement('div');
  items.className = 'agenda__items';
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className = 'agenda__none';
    empty.textContent = '誕生日はありません';
    items.appendChild(empty);
  }
  cards.forEach(card => items.appendChild(card));
  row.appendChild(items);
  return row;
}

function makeItem(ev, tag) {
  const item = document.createElement(tag || 'div');
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
  return item;
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
  events.forEach(ev => body.appendChild(makeItem(ev)));

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

  if (!query) {
    body.appendChild(searchMessage('生徒名または学校名で検索できます'));
    return;
  }

  const all = [];
  for (const list of byDay.values()) {
    for (const ev of list) if (matchesQuery(ev)) all.push(ev);
  }
  if (!all.length) {
    body.appendChild(searchMessage('「' + query + '」に一致する生徒はいません'));
    return;
  }
  all.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, 'ja'));

  const count = document.createElement('p');
  count.className = 'search-view__count';
  count.textContent = all.length + ' 人の生徒';
  body.appendChild(count);

  // Grouped by month, then by day, in the same rows as the agenda. Weekdays
  // are for the year being viewed, which is where a tap jumps to.
  const year = view.getFullYear();
  const today = new Date();
  const days = new Map(); // "M-D" -> events, in sorted order
  for (const ev of all) {
    const key = ev.month + '-' + ev.day;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(ev);
  }

  let group = null;
  for (const events of days.values()) {
    const { month, day } = events[0];
    if (!group || group.month !== month) {
      group = document.createElement('section');
      group.className = 'search-group';
      group.month = month;
      const title = document.createElement('h2');
      title.className = 'search-group__title';
      title.textContent = MONTHS[month - 1];
      group.appendChild(title);
      body.appendChild(group);
    }
    const cards = events.map(ev => {
      const card = makeItem(ev, 'button');
      // Jump the agenda to that day and return to it.
      card.addEventListener('click', () => {
        view = new Date(year, month - 1, 1);
        closeSearch();
        render(day);
      });
      return card;
    });
    const date = new Date(year, month - 1, day);
    group.appendChild(dayRow(date, sameDay(date, today), cards));
  }
}

function searchMessage(text) {
  const el = document.createElement('div');
  el.className = 'search-view__message';
  el.innerHTML = '<svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true"><path d="M29 27.586l-7.552-7.552a11.018 11.018 0 10-1.414 1.414L27.586 29zM4 13a9 9 0 119 9 9.01 9.01 0 01-9-9z"/></svg>';
  const p = document.createElement('p');
  p.textContent = text;
  el.appendChild(p);
  return el;
}

function openSearch() {
  const v = document.getElementById('searchView');
  v.classList.add('search-view--open');
  v.setAttribute('aria-hidden', 'false');
  v.inert = false;
  const input = document.getElementById('searchInput');
  input.value = query;
  syncClear();
  renderResults();
  input.focus();
}

function closeSearch() {
  const v = document.getElementById('searchView');
  if (!v.classList.contains('search-view--open')) return;
  // Hand focus back before hiding, so it never sits inside a hidden view.
  document.getElementById('searchOpen').focus();
  v.classList.remove('search-view--open');
  v.setAttribute('aria-hidden', 'true');
  v.inert = true;
}

function setQuery(value) {
  query = value.trim().toLowerCase();
  syncClear();
  render();
  renderResults();
}

// The clear button only shows while there is something to clear.
function syncClear() {
  document.getElementById('searchClear').hidden = !document.getElementById('searchInput').value;
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
document.getElementById('searchClear').addEventListener('click', () => {
  mobileSearch.value = desktopSearch.value = '';
  setQuery('');
  mobileSearch.focus();
});

// Re-render when crossing the breakpoint: the agenda can only scroll to today
// once it is visible.
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
  .catch(() => {
    document.getElementById('notice').classList.add('notification--show');
    document.getElementById('noticeReload').addEventListener('click', () => {
      location.reload();
    });
    render();
  });
