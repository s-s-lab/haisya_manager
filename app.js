/*
 * Team Ride Planner frontend v4
 * - Local browser-created event list
 * - Driver/rider register both nearest station and address
 * - Recommendations use destination address, rider address, and driver addresses
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbx-RP8Tgs3I2wGxLhf_7WMf9YGXNyrdXpGZ1-YJdCWVghrOoJrMAVQcAGFs3RcpyppVlg/exec';
const LOCAL_EVENTS_KEY = 'teamRidePlanner.createdEvents.v1';

const TRIP_LABEL = {
  outbound: '往路',
  return: '復路',
  round: '往復',
  local: '現地集合'
};

const state = {
  eventId: null,
  event: null,
  members: [],
  assignments: [],
  costs: [],
  currentTrip: 'outbound',
  sortables: [],
  activeCostDriverId: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function getEventIdFromUrl() {
  return new URLSearchParams(location.search).get('eventId');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function yen(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ja-JP')}円`;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2400);
}

function setLoading(button, loading, labelWhenLoading = '処理中...') {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = labelWhenLoading;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function getLocalEvents() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function saveLocalEvents(events) {
  localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
}

function rememberCreatedEvent(eventInfo) {
  const events = getLocalEvents();
  const next = [
    {
      eventId: eventInfo.eventId,
      eventName: eventInfo.eventName || '',
      eventDate: eventInfo.eventDate || '',
      destinationName: eventInfo.destinationName || '',
      destinationAddress: eventInfo.destinationAddress || '',
      createdAt: eventInfo.createdAt || new Date().toISOString()
    },
    ...events.filter((e) => e.eventId !== eventInfo.eventId)
  ].slice(0, 30);

  saveLocalEvents(next);
}

function renderLocalEvents() {
  const box = $('#localEventList');
  if (!box) return;

  const events = getLocalEvents();

  if (!events.length) {
    box.innerHTML = `
      <div class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        このブラウザで作成したイベントはまだありません。
      </div>`;
    return;
  }

  box.innerHTML = events.map((event) => {
    const destination = event.destinationName
      ? `${event.destinationName} / ${event.destinationAddress || ''}`
      : event.destinationAddress || '';

    return `
      <div class="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-bold">${escapeHtml(event.eventName || '名称未設定イベント')}</p>
            <p class="mt-1 text-sm text-slate-600">${escapeHtml(event.eventDate || '日付未設定')} / ${escapeHtml(destination)}</p>
            <p class="mt-1 text-xs text-slate-500">eventId: ${escapeHtml(event.eventId)}</p>
          </div>
          <button class="local-event-open rounded-xl bg-team-600 px-4 py-2 text-sm font-bold text-white hover:bg-team-700" data-event-id="${escapeHtml(event.eventId)}">
            開く
          </button>
        </div>
      </div>`;
  }).join('');

  $$('.local-event-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      location.href = `${location.pathname}?eventId=${encodeURIComponent(btn.dataset.eventId)}`;
    });
  });
}

async function apiPost(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'APIエラーが発生しました。');
  return data;
}

async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'APIエラーが発生しました。');
  return data;
}

function init() {
  state.eventId = getEventIdFromUrl();
  bindEvents();

  if (!state.eventId) {
    $('#setupView').classList.remove('hidden');
    renderLocalEvents();
    return;
  }

  $('#appView').classList.remove('hidden');
  loadEvent();
}

function bindEvents() {
  $('#openEventBtn').addEventListener('click', openExistingEvent);
  $('#existingEventId').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openExistingEvent();
  });

  $('#clearLocalEventsBtn').addEventListener('click', () => {
    if (!confirm('このブラウザに保存されたイベント履歴を削除しますか？')) return;
    saveLocalEvents([]);
    renderLocalEvents();
    showToast('イベント履歴を削除しました。');
  });

  $('#createEventBtn').addEventListener('click', createEvent);
  $('#copyEventIdBtn').addEventListener('click', copyEventId);
  $('#copyUrlBtn').addEventListener('click', copyShareUrl);
  $('#reloadBtn').addEventListener('click', loadEvent);
  $('#driverForm').addEventListener('submit', submitMemberForm);
  $('#riderForm').addEventListener('submit', submitMemberForm);
  $('#driverCancelBtn').addEventListener('click', () => resetMemberForm('driver'));
  $('#riderCancelBtn').addEventListener('click', () => resetMemberForm('rider'));
  $('#recommendBtn').addEventListener('click', loadRecommendations);
  $('#saveAssignmentsBtn').addEventListener('click', saveAssignments);
  $('#closeCostModalBtn').addEventListener('click', closeCostModal);
  $('#saveCostBtn').addEventListener('click', saveCost);
  $('#gasCost').addEventListener('input', renderSettlementResult);
  $('#tollCost').addEventListener('input', renderSettlementResult);

  $$('.trip-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentTrip = btn.dataset.tripTab;
      renderAll();
    });
  });
}

function openExistingEvent() {
  const eventId = $('#existingEventId').value.trim();
  if (!eventId) {
    showToast('イベントIDを入力してください。');
    return;
  }
  location.href = `${location.pathname}?eventId=${encodeURIComponent(eventId)}`;
}

async function createEvent() {
  const btn = $('#createEventBtn');
  const eventName = $('#eventName').value.trim();
  const eventDate = $('#eventDate').value;
  const destinationName = $('#destinationName').value.trim();
  const destinationAddress = $('#destinationAddress').value.trim();

  if (!eventName || !destinationAddress) {
    showToast('イベント名と目的地住所・施設名を入力してください。');
    return;
  }

  try {
    setLoading(btn, true, '作成中...');
    const data = await apiPost('createEvent', { eventName, eventDate, destinationName, destinationAddress });

    rememberCreatedEvent({
      eventId: data.eventId,
      eventName,
      eventDate,
      destinationName,
      destinationAddress,
      createdAt: new Date().toISOString()
    });

    location.href = `${location.pathname}?eventId=${encodeURIComponent(data.eventId)}`;
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(btn, false);
  }
}

async function loadEvent() {
  try {
    const data = await apiGet('getEvent', { eventId: state.eventId });
    state.event = data.event;
    state.members = data.members || [];
    state.assignments = data.assignments || [];
    state.costs = data.costs || [];
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function renderAll() {
  renderEventHeader();
  renderMemberList();
  renderTripTabs();
  renderAllocationBoard();
}

function renderEventHeader() {
  $('#eventTitle').textContent = state.event?.eventName || '';
  const destination = state.event?.destinationName
    ? `${state.event.destinationName}（${state.event.destinationAddress || ''}）`
    : state.event?.destinationAddress || '';
  $('#eventMeta').textContent = `${state.event?.eventDate || '日付未設定'} / 目的地：${destination}`;
  $('#eventBadge').classList.remove('hidden');
  $('#eventBadge').textContent = `eventId: ${state.eventId}`;
}

function renderTripTabs() {
  $$('.trip-tab').forEach((btn) => {
    const active = btn.dataset.tripTab === state.currentTrip;
    btn.className = `trip-tab rounded-xl px-4 py-2 text-sm font-bold ${active ? 'bg-white text-team-700 shadow-sm' : 'text-slate-600 hover:text-team-700'}`;
  });
}

function submitMemberForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  payload.eventId = state.eventId;
  payload.largeCargo = formData.has('largeCargo');
  payload.capacity = payload.type === 'driver' ? Number(payload.capacity || 1) : '';

  if (!payload.memberId) delete payload.memberId;

  upsertMember(payload, form);
}

async function upsertMember(payload, form) {
  const submitBtn = form.querySelector('button[type="submit"], button:not([type])');

  try {
    setLoading(submitBtn, true, payload.memberId ? '更新中...' : '登録中...');
    await apiPost('upsertMember', payload);
    resetMemberForm(payload.type);
    await loadEvent();
    showToast(payload.memberId ? '更新しました。' : '登録しました。');
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(submitBtn, false);
  }
}

function resetMemberForm(type) {
  const form = type === 'driver' ? $('#driverForm') : $('#riderForm');
  form.reset();
  form.querySelector('[name="memberId"]').value = '';

  if (type === 'driver') {
    form.querySelector('[name="capacity"]').value = 4;
    $('#driverFormTitle').textContent = 'ドライバー登録';
    $('#driverSubmitBtn').textContent = 'ドライバーを登録';
    $('#driverCancelBtn').classList.add('hidden');
  } else {
    $('#riderFormTitle').textContent = '同乗希望者登録';
    $('#riderSubmitBtn').textContent = '同乗希望者を登録';
    $('#riderCancelBtn').classList.add('hidden');
  }
}

function editMember(memberId) {
  const member = state.members.find((m) => m.memberId === memberId);
  if (!member) return;

  const form = member.type === 'driver' ? $('#driverForm') : $('#riderForm');

  form.querySelector('[name="memberId"]').value = member.memberId;
  form.querySelector('[name="name"]').value = member.name || '';
  form.querySelector('[name="originStation"]').value = member.originStation || '';
  form.querySelector('[name="originAddress"]').value = member.originAddress || '';
  form.querySelector('[name="tripPref"]').value = member.tripPref || 'round';

  if (member.type === 'driver') {
    form.querySelector('[name="capacity"]').value = Number(member.capacity || 1);
    form.querySelector('[name="largeCargo"]').checked = !!member.largeCargo;
    $('#driverFormTitle').textContent = 'ドライバー情報を修正';
    $('#driverSubmitBtn').textContent = 'ドライバー情報を更新';
    $('#driverCancelBtn').classList.remove('hidden');
  } else {
    $('#riderFormTitle').textContent = '同乗希望者情報を修正';
    $('#riderSubmitBtn').textContent = '同乗希望者情報を更新';
    $('#riderCancelBtn').classList.remove('hidden');
  }

  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteMember(memberId) {
  const member = state.members.find((m) => m.memberId === memberId);
  if (!member) return;

  if (!confirm(`${member.name}さんを削除します。配車割当も削除されます。よろしいですか？`)) return;

  try {
    await apiPost('deleteMember', { eventId: state.eventId, memberId });
    if (member.type === 'driver') resetMemberForm('driver');
    if (member.type === 'rider') resetMemberForm('rider');
    await loadEvent();
    showToast('削除しました。');
  } catch (error) {
    alert(error.message);
  }
}

async function loadRecommendations() {
  const btn = $('#recommendBtn');
  const riderStation = $('#riderStation').value.trim();
  const riderAddress = $('#riderAddress').value.trim();
  const tripPref = $('#riderTripPref').value;
  const trip = tripPref === 'return' ? 'return' : 'outbound';

  if (!riderStation) {
    showToast('同乗希望者の最寄り駅を入力してください。');
    return;
  }

  if (!riderAddress) {
    showToast('同乗希望者の住所を入力してください。');
    return;
  }

  if (tripPref === 'local') {
    showToast('現地集合の場合、おすすめドライバーは表示しません。');
    return;
  }

  try {
    setLoading(btn, true, '計算中...');
    const data = await apiPost('recommendDrivers', {
      eventId: state.eventId,
      riderStation,
      riderAddress,
      trip
    });
    renderRecommendations(data.recommendations || []);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(btn, false);
  }
}

function renderRecommendations(items) {
  const box = $('#recommendations');
  box.classList.remove('hidden');

  if (!items.length) {
    box.innerHTML = '<p class="text-sm text-slate-600">おすすめ候補がありません。先にドライバーを登録してください。</p>';
    return;
  }

  box.innerHTML = `
    <p class="mb-2 text-sm font-bold text-slate-700">おすすめのドライバー順</p>
    <p class="mb-3 text-xs text-slate-500">
      目的地住所・同乗希望者住所・各ドライバー住所をもとに、寄り道時間が短い順に表示しています。
    </p>
    <div class="space-y-2">
      ${items.map((item, index) => `
        <div class="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-bold">${index + 1}. ${escapeHtml(item.driverName)}</p>
              <p class="text-xs text-slate-500">最寄り駅：${escapeHtml(item.driverStation)}</p>
              <p class="text-xs text-slate-500">住所：${escapeHtml(item.driverAddress)}</p>
            </div>
            <span class="rounded-full ${item.largeCargo ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'} px-2 py-1 text-xs font-bold">
              ${item.largeCargo ? '大型荷物OK' : '大型荷物未対応'}
            </span>
          </div>
          <div class="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div class="rounded-xl bg-slate-50 p-2">
              ドライバー→同乗者<br>
              <b>${Math.round(item.driverToRiderDurationSeconds / 60)}分</b>
            </div>
            <div class="rounded-xl bg-slate-50 p-2">
              追加時間<br>
              <b>${Math.round(item.detourDurationSeconds / 60)}分</b>
            </div>
            <div class="rounded-xl bg-slate-50 p-2">
              追加距離<br>
              <b>${(item.detourDistanceMeters / 1000).toFixed(1)}km</b>
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function renderMemberList() {
  const box = $('#memberList');
  const drivers = state.members.filter((m) => m.type === 'driver');
  const riders = state.members.filter((m) => m.type === 'rider');

  box.innerHTML = `
    <div class="rounded-2xl bg-slate-50 p-3">
      <p class="font-bold">ドライバー ${drivers.length}名</p>
      <div class="mt-2 space-y-2">
        ${drivers.map(renderMemberListItem).join('') || '<p class="text-sm text-slate-500">未登録</p>'}
      </div>
    </div>
    <div class="rounded-2xl bg-slate-50 p-3">
      <p class="font-bold">同乗希望者 ${riders.length}名</p>
      <div class="mt-2 space-y-2">
        ${riders.map(renderMemberListItem).join('') || '<p class="text-sm text-slate-500">未登録</p>'}
      </div>
    </div>`;

  $$('.edit-member-btn').forEach((btn) => btn.addEventListener('click', () => editMember(btn.dataset.memberId)));
  $$('.delete-member-btn').forEach((btn) => btn.addEventListener('click', () => deleteMember(btn.dataset.memberId)));
}

function renderMemberListItem(m) {
  return `
    <div class="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
      <div class="flex items-start justify-between gap-2">
        <div>
          <b>${escapeHtml(m.name)}</b> / ${TRIP_LABEL[m.tripPref] || m.tripPref}${m.type === 'driver' ? ` / ${Number(m.capacity || 1)}名` : ''}
          <br><span class="text-slate-500">最寄り駅：${escapeHtml(m.originStation || '')}</span>
          <br><span class="text-slate-500">住所：${escapeHtml(m.originAddress || '')}</span>
          ${m.largeCargo ? '<br><span class="font-bold text-green-700">大型荷物OK</span>' : ''}
        </div>
        <div class="flex shrink-0 gap-1">
          <button class="edit-member-btn rounded-lg bg-team-50 px-2 py-1 text-xs font-bold text-team-700 hover:bg-team-100" data-member-id="${escapeHtml(m.memberId)}">修正</button>
          <button class="delete-member-btn rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100" data-member-id="${escapeHtml(m.memberId)}">削除</button>
        </div>
      </div>
    </div>`;
}

function eligibleForTrip(member, trip) {
  if (member.tripPref === 'round') return true;
  if (member.tripPref === 'local') return false;
  return member.tripPref === trip;
}

function assignedRiderIdsForTrip(trip) {
  return state.assignments
    .filter((a) => a.trip === trip)
    .map((a) => a.memberId);
}

function renderAllocationBoard() {
  destroySortables();

  const board = $('#allocationBoard');
  const trip = state.currentTrip;
  const drivers = state.members.filter((m) => m.type === 'driver' && eligibleForTrip(m, trip));
  const riders = state.members.filter((m) => m.type === 'rider' && eligibleForTrip(m, trip));
  const assignedIds = assignedRiderIdsForTrip(trip);
  const unassigned = riders.filter((m) => !assignedIds.includes(m.memberId));

  board.innerHTML = `
    <div class="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div class="flex items-center justify-between">
        <h4 class="font-bold">未配置メンバー</h4>
        <span class="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">${unassigned.length}名</span>
      </div>
      <div id="unassignedList" class="drop-list mt-3 min-h-32 space-y-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-2" data-driver-id="">
        ${unassigned.map(renderMemberCard).join('')}
      </div>
    </div>
    <div class="grid gap-4 xl:grid-cols-2">
      ${drivers.map(renderDriverCard).join('') || '<div class="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">この区分で利用できるドライバーがいません。</div>'}
    </div>`;

  initSortables();
  updateCapacityCounts();
}

function renderMemberCard(member) {
  return `
    <div class="member-card cursor-grab rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 active:cursor-grabbing" data-member-id="${escapeHtml(member.memberId)}">
      <div class="flex items-center justify-between gap-2">
        <b>${escapeHtml(member.name)}</b>
        <span class="rounded-full bg-team-50 px-2 py-1 text-xs font-bold text-team-700">${TRIP_LABEL[member.tripPref] || member.tripPref}</span>
      </div>
      <p class="mt-1 text-xs text-slate-500">最寄り駅：${escapeHtml(member.originStation || '')}</p>
      <p class="text-xs text-slate-500">住所：${escapeHtml(member.originAddress || '')}</p>
    </div>`;
}

function renderDriverCard(driver) {
  const trip = state.currentTrip;
  const assigned = state.assignments
    .filter((a) => a.trip === trip && a.driverId === driver.memberId)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((a) => state.members.find((m) => m.memberId === a.memberId))
    .filter(Boolean);

  return `
    <div class="driver-card rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-driver-id="${escapeHtml(driver.memberId)}" data-capacity="${Number(driver.capacity || 1)}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h4 class="text-lg font-bold">🚙 ${escapeHtml(driver.name)} 車</h4>
          <p class="text-xs text-slate-500">最寄り駅：${escapeHtml(driver.originStation || '')}</p>
          <p class="text-xs text-slate-500">住所：${escapeHtml(driver.originAddress || '')}</p>
          <p class="mt-1 text-xs font-bold ${driver.largeCargo ? 'text-green-700' : 'text-slate-400'}">${driver.largeCargo ? '大型荷物OK' : '大型荷物未対応'}</p>
        </div>
        <div class="text-right">
          <p class="capacity-count text-sm font-black"></p>
          <button class="cost-btn mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200" data-driver-id="${escapeHtml(driver.memberId)}">精算</button>
        </div>
      </div>
      <div class="mt-3 rounded-2xl bg-slate-50 p-2 text-sm font-bold text-slate-700">運転者：${escapeHtml(driver.name)}</div>
      <div class="passenger-list drop-list mt-3 min-h-28 space-y-2 rounded-2xl border-2 border-dashed border-team-100 bg-team-50/40 p-2" data-driver-id="${escapeHtml(driver.memberId)}">
        ${assigned.map(renderMemberCard).join('')}
      </div>
    </div>`;
}

function initSortables() {
  $$('.drop-list').forEach((el) => {
    const sortable = new Sortable(el, {
      group: 'ride-members',
      animation: 150,
      delayOnTouchOnly: true,
      delay: 120,
      ghostClass: 'opacity-40',
      chosenClass: 'ring-2',
      onEnd: updateCapacityCounts
    });
    state.sortables.push(sortable);
  });

  $$('.cost-btn').forEach((btn) => {
    btn.addEventListener('click', () => openCostModal(btn.dataset.driverId));
  });
}

function destroySortables() {
  state.sortables.forEach((s) => s.destroy());
  state.sortables = [];
}

function updateCapacityCounts() {
  $$('.driver-card').forEach((card) => {
    const capacity = Number(card.dataset.capacity || 1);
    const passengerCount = card.querySelectorAll('.member-card').length;
    const current = passengerCount + 1;
    const count = card.querySelector('.capacity-count');
    const over = current > capacity;
    const full = current === capacity;

    count.textContent = `${current} / ${capacity}`;
    count.className = `capacity-count text-sm font-black ${over ? 'text-red-600' : full ? 'text-orange-600' : 'text-team-700'}`;
    card.classList.toggle('ring-red-300', over);
    card.classList.toggle('bg-red-50', over);
  });
}

async function saveAssignments() {
  const btn = $('#saveAssignmentsBtn');
  const items = [];

  $$('.passenger-list').forEach((list) => {
    const driverId = list.dataset.driverId;
    Array.from(list.querySelectorAll('.member-card')).forEach((card, index) => {
      items.push({ memberId: card.dataset.memberId, driverId, position: index + 1 });
    });
  });

  const overCapacity = $$('.driver-card').some((card) => {
    const capacity = Number(card.dataset.capacity || 1);
    const current = card.querySelectorAll('.member-card').length + 1;
    return current > capacity;
  });

  if (overCapacity && !confirm('定員を超えている車があります。このまま保存しますか？')) return;

  try {
    setLoading(btn, true, '保存中...');
    await apiPost('saveAssignments', { eventId: state.eventId, trip: state.currentTrip, items });
    await loadEvent();
    showToast('配車を保存しました。');
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(btn, false);
  }
}

function copyEventId() {
  navigator.clipboard.writeText(state.eventId).then(() => showToast('イベントIDをコピーしました。'));
}

function copyShareUrl() {
  navigator.clipboard.writeText(location.href).then(() => showToast('共有URLをコピーしました。'));
}

function openCostModal(driverId) {
  state.activeCostDriverId = driverId;
  const driver = state.members.find((m) => m.memberId === driverId);
  const cost = state.costs.find((c) => c.driverId === driverId) || {};

  $('#costModalTitle').textContent = `${driver?.name || ''} 車の精算`;
  $('#gasCost').value = Number(cost.gasCost || 0);
  $('#tollCost').value = Number(cost.tollCost || 0);
  $('#costModal').classList.remove('hidden');
  $('#costModal').classList.add('flex');

  renderSettlementResult();
}

function closeCostModal() {
  $('#costModal').classList.add('hidden');
  $('#costModal').classList.remove('flex');
  state.activeCostDriverId = null;
}

function getRiderIdsByDriverAndTrip(driverId, trip) {
  return state.assignments
    .filter((a) => a.driverId === driverId && a.trip === trip)
    .map((a) => a.memberId);
}

function getSettlementRows(driverId) {
  const driver = state.members.find((m) => m.memberId === driverId);
  if (!driver) return [];

  const rowsByMember = new Map();

  const ensure = (member, role) => {
    if (!rowsByMember.has(member.memberId)) {
      rowsByMember.set(member.memberId, {
        memberId: member.memberId,
        name: member.name,
        role,
        outbound: false,
        return: false,
        weight: 0
      });
    }
    return rowsByMember.get(member.memberId);
  };

  const driverRow = ensure(driver, 'driver');
  driverRow.outbound = eligibleForTrip(driver, 'outbound');
  driverRow.return = eligibleForTrip(driver, 'return');

  ['outbound', 'return'].forEach((trip) => {
    getRiderIdsByDriverAndTrip(driverId, trip).forEach((memberId) => {
      const member = state.members.find((m) => m.memberId === memberId);
      if (!member) return;
      const row = ensure(member, 'rider');
      row[trip] = true;
    });
  });

  return Array.from(rowsByMember.values()).map((row) => {
    row.weight = (row.outbound ? 0.5 : 0) + (row.return ? 0.5 : 0);
    return row;
  }).filter((row) => row.weight > 0);
}

function renderSettlementResult() {
  const driverId = state.activeCostDriverId;
  if (!driverId) return;

  const gas = Number($('#gasCost').value || 0);
  const toll = Number($('#tollCost').value || 0);
  const total = gas + toll;
  const rows = getSettlementRows(driverId);
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const unit = totalWeight > 0 ? total / totalWeight : 0;

  $('#settlementResult').innerHTML = `
    <div class="flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <span class="font-bold">合計</span><span class="text-lg font-black text-team-700">${yen(total)}</span>
    </div>
    <div class="mt-3 space-y-2">
      ${rows.map((row) => `
        <div class="flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div>
            <b>${escapeHtml(row.name)}</b>
            <span class="ml-1 text-xs text-slate-500">${row.role === 'driver' ? '運転者' : '同乗者'}</span>
            <p class="text-xs text-slate-500">${row.outbound ? '往路' : ''}${row.outbound && row.return ? '・' : ''}${row.return ? '復路' : ''} / 係数 ${row.weight}</p>
          </div>
          <b>${yen(unit * row.weight)}</b>
        </div>`).join('') || '<p class="text-slate-500">配車が未設定です。</p>'}
    </div>`;
}

async function saveCost() {
  const btn = $('#saveCostBtn');

  try {
    setLoading(btn, true, '保存中...');
    await apiPost('updateCosts', {
      eventId: state.eventId,
      driverId: state.activeCostDriverId,
      gasCost: Number($('#gasCost').value || 0),
      tollCost: Number($('#tollCost').value || 0)
    });
    await loadEvent();
    closeCostModal();
    showToast('精算情報を保存しました。');
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(btn, false);
  }
}

document.addEventListener('DOMContentLoaded', init);
