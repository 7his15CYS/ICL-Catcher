function getConfig() { return window.APP_CONFIG || {}; }

const els = {
  appReady: document.getElementById('app-ready'),
  authSection: document.getElementById('auth-section'),
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  messageBox: document.getElementById('message-box'),
  memberSection: document.getElementById('member-section'),
  memberName: document.getElementById('member-name'),
  memberAvatar: document.getElementById('member-avatar'),
  memberPoints: document.getElementById('member-points'),
  ichibanEventList: document.getElementById('ichiban-event-list'),
  ichibanDetailSection: document.getElementById('ichiban-detail-section'),
  ichibanDetailTitle: document.getElementById('ichiban-detail-title'),
  ichibanDetailImage: document.getElementById('ichiban-detail-image'),
  ichibanDetailDescription: document.getElementById('ichiban-detail-description'),
  ichibanDetailStats: document.getElementById('ichiban-detail-stats'),
  ichibanPrizeList: document.getElementById('ichiban-prize-list'),
  ticketGrid: document.getElementById('ticket-grid'),
  playIchibanBtn: document.getElementById('play-ichiban-btn'),
  refreshIchibanBtn: document.getElementById('refresh-ichiban-btn'),
  leaveIchibanBtn: document.getElementById('leave-ichiban-btn'),
  lockStatus: document.getElementById('ichiban-lock-status'),
  historySection: document.getElementById('ichiban-history-section'),
  historyList: document.getElementById('ichiban-history-list'),
};

const state = {
  accessToken: null,
  dashboard: null,
  pending: new Set(),
  events: [],
  currentEventId: new URL(window.location.href).searchParams.get('eventId') || null,
  currentEvent: null,
  selectedTicketId: null,
  lockHeartbeat: null,
};

function normalizeError(err, fallback = '發生錯誤') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object') return err.message || err.error || fallback;
  return String(err);
}
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function showMessage(message, isError = false) {
  const text = typeof message === 'string' ? message : normalizeError(message);
  if (!text) { els.messageBox.style.display = 'none'; return; }
  els.messageBox.textContent = text;
  els.messageBox.style.display = 'block';
  els.messageBox.className = isError ? 'message error' : 'message success';
}
function clearMessage() { showMessage(''); }
function setButtonLoading(button, isLoading, loadingText = '處理中...') {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent || '';
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}
function startPending(key) { if (state.pending.has(key)) throw new Error('上一個操作尚未完成'); state.pending.add(key); }
function endPending(key) { state.pending.delete(key); }
function getCleanAppUrl() { return `${window.location.origin}${window.location.pathname}`; }
function hasLiffRedirectParams() {
  const url = new URL(window.location.href);
  return url.searchParams.has('code') || url.searchParams.has('state') || url.searchParams.has('liffClientId') || url.searchParams.has('liffRedirectUri');
}
function makeRequestId(prefix) { return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`; }

async function callApi(action, payload = {}) {
  const config = getConfig();
  const res = await fetch(`${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey },
    body: JSON.stringify({ action, accessToken: state.accessToken, ...payload }),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok || data.ok === false) throw data;
  return data;
}

function renderLoggedOut() {
  els.authSection.style.display = 'block';
  els.memberSection.style.display = 'none';
  els.logoutBtn.style.display = 'none';
  els.loginBtn.style.display = 'inline-flex';
}

function renderMember(data) {
  const member = data.member || {};
  els.authSection.style.display = 'none';
  els.memberSection.style.display = 'block';
  els.logoutBtn.style.display = 'inline-flex';
  els.loginBtn.style.display = 'none';
  els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  els.memberPoints.textContent = String(data.points ?? 0);
  els.memberAvatar.src = member.avatar_url || 'https://placehold.co/96x96?text=User';
}

function renderEventList() {
  if (!state.events.length) {
    els.ichibanEventList.innerHTML = '<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.ichibanEventList.innerHTML = state.events.map((event) => `
    <div class="reward-card">
      <img class="reward-image" src="${escapeHtml(event.cover_image_url || 'https://placehold.co/600x400?text=Ichiban')}" alt="${escapeHtml(event.title)}">
      <div class="reward-body">
        <span class="reward-category">線上一番賞</span>
        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.description || '')}</p>
        <div class="reward-meta"><span>${escapeHtml(event.point_cost)} 點 / 抽</span><span>剩餘 ${escapeHtml(event.remaining_tickets)}</span></div>
        <button class="btn btn-primary open-ichiban-btn" type="button" data-event-id="${escapeHtml(event.id)}" ${Number(event.remaining_tickets) <= 0 ? 'disabled' : ''}>${Number(event.remaining_tickets) <= 0 ? '已完售' : '進入活動'}</button>
      </div>
    </div>`).join('');

  els.ichibanEventList.querySelectorAll('.open-ichiban-btn').forEach((btn) => {
    btn.addEventListener('click', () => enterEvent(btn.dataset.eventId));
  });
}

function renderCurrentEvent() {
  const event = state.currentEvent;
  if (!event) {
    els.ichibanDetailSection.style.display = 'none';
    els.historySection.style.display = 'none';
    return;
  }

  els.ichibanDetailSection.style.display = 'block';
  els.historySection.style.display = 'block';
  els.ichibanDetailTitle.textContent = event.title;
  els.ichibanDetailImage.src = event.cover_image_url || 'https://placehold.co/1200x600?text=Ichiban';
  els.ichibanDetailDescription.textContent = event.description || '暫無活動說明';
  els.ichibanDetailStats.innerHTML = `
    <div class="stat-chip">每抽 ${escapeHtml(event.point_cost)} 點</div>
    <div class="stat-chip">總籤數 ${escapeHtml(event.total_tickets)}</div>
    <div class="stat-chip">剩餘 ${escapeHtml(event.remaining_tickets)}</div>
  `;

  els.ichibanPrizeList.innerHTML = (event.prizes || []).map((prize) => `
    <div class="prize-chip">
      <span class="prize-chip-title">${escapeHtml(prize.name)}</span>
      <span class="prize-chip-meta">${escapeHtml(prize.quantity)} 張</span>
    </div>`).join('') || '<div class="empty-state">尚未設定獎項</div>';

  renderTickets(event.tickets || []);
  renderHistory(event.my_results || []);
  const busyText = event.lock_status?.is_locked && !event.lock_status?.is_mine
    ? `鎖定中：${event.lock_status.locked_by_display_name || '其他玩家'}`
    : event.lock_status?.is_mine
    ? '你已鎖定活動，可開始選籤'
    : '未鎖定';
  els.lockStatus.textContent = busyText;
  els.lockStatus.className = `status-chip ${event.lock_status?.is_locked ? 'busy' : 'idle'}`;
  els.playIchibanBtn.disabled = !event.lock_status?.is_mine || !state.selectedTicketId;
}

function renderTickets(tickets) {
  if (!tickets.length) {
    els.ticketGrid.innerHTML = '<div class="empty-state">沒有可用籤紙</div>';
    return;
  }
  els.ticketGrid.innerHTML = tickets.map((ticket) => {
    const isSelected = state.selectedTicketId === ticket.id;
    const classes = ['ticket-tile'];
    if (isSelected) classes.push('selected');
    return `<button class="${classes.join(' ')}" type="button" data-ticket-id="${escapeHtml(ticket.id)}" ${ticket.status !== 'available' ? 'disabled' : ''}><span class="ticket-label">${escapeHtml(ticket.display_no)}</span></button>`;
  }).join('');

  els.ticketGrid.querySelectorAll('.ticket-tile').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.currentEvent?.lock_status?.is_mine) {
        showMessage('請先取得活動鎖定後再選籤', true);
        return;
      }
      state.selectedTicketId = btn.dataset.ticketId;
      renderCurrentEvent();
    });
  });
}

function renderHistory(list) {
  if (!list.length) {
    els.historyList.innerHTML = '<div class="empty-state">你還沒有抽過這個活動</div>';
    return;
  }
  els.historyList.innerHTML = list.map((item) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(item.prize_name || '未中獎')}</div>
        <div class="list-subtitle">籤號 ${escapeHtml(item.ticket_display_no)} ・ ${new Date(item.created_at).toLocaleString('zh-TW')}</div>
      </div>
      <div class="list-points">-${escapeHtml(item.points_spent)} 點</div>
    </div>`).join('');
}

async function loadDashboard() {
  const data = await callApi('login');
  state.dashboard = data;
  state.events = data.ichiban_events || [];
  renderMember(data);
  renderEventList();
}

async function openEvent(eventId) {
  const data = await callApi('get_ichiban_event_detail', { eventId });
  state.currentEventId = eventId;
  state.currentEvent = data.event;
  state.selectedTicketId = null;
  renderCurrentEvent();
  const url = new URL(window.location.href);
  url.searchParams.set('eventId', eventId);
  window.history.replaceState({}, document.title, url.toString());
}

async function enterEvent(eventId) {
  const key = `enter:${eventId}`;
  try {
    startPending(key);
    clearMessage();
    await callApi('acquire_ichiban_lock', { eventId });
    await openEvent(eventId);
    showMessage('已取得活動鎖定，現在其他人暫時不能搶進來。');
    startHeartbeat();
  } catch (error) {
    showMessage(normalizeError(error, '進入活動失敗'), true);
  } finally {
    endPending(key);
  }
}

async function leaveEvent() {
  if (!state.currentEventId) return;
  try {
    stopHeartbeat();
    await callApi('release_ichiban_lock', { eventId: state.currentEventId });
  } catch {}
  state.currentEvent = null;
  state.selectedTicketId = null;
  renderCurrentEvent();
  showMessage('已離開活動並釋放鎖定');
}

async function refreshEvent() {
  if (!state.currentEventId) return;
  try {
    await openEvent(state.currentEventId);
  } catch (error) {
    showMessage(normalizeError(error, '刷新活動失敗'), true);
  }
}

async function playIchiban() {
  const key = 'playIchiban';
  try {
    startPending(key);
    setButtonLoading(els.playIchibanBtn, true, '抽獎中...');
    clearMessage();
    if (!state.currentEventId || !state.selectedTicketId) throw new Error('請先選擇籤紙');
    const result = await callApi('play_ichiban', {
      eventId: state.currentEventId,
      ticketId: state.selectedTicketId,
      requestId: makeRequestId('ichiban-play'),
    });
    showMessage(`抽獎成功：你抽到 ${result.result?.prize_name || '未中獎'}，已扣 ${result.result?.points_spent || 0} 點`);
    await loadDashboard();
    await openEvent(state.currentEventId);
  } catch (error) {
    showMessage(normalizeError(error, '抽獎失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(els.playIchibanBtn, false);
  }
}

function startHeartbeat() {
  stopHeartbeat();
  state.lockHeartbeat = window.setInterval(async () => {
    if (!state.currentEventId) return;
    try {
      await callApi('keepalive_ichiban_lock', { eventId: state.currentEventId });
      await openEvent(state.currentEventId);
    } catch {
      stopHeartbeat();
    }
  }, 20000);
}
function stopHeartbeat() {
  if (state.lockHeartbeat) {
    window.clearInterval(state.lockHeartbeat);
    state.lockHeartbeat = null;
  }
}

async function signIn() {
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: getCleanAppUrl() });
    return;
  }
  await bootstrap();
}

async function signOut() {
  await leaveEvent();
  if (window.liff && liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.dashboard = null;
  renderLoggedOut();
  showMessage('已登出');
}

async function bootstrap() {
  try {
    const config = getConfig();
    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: true });
    if (liff.isLoggedIn() && hasLiffRedirectParams()) {
      window.history.replaceState({}, document.title, getCleanAppUrl() + (state.currentEventId ? `?eventId=${encodeURIComponent(state.currentEventId)}` : ''));
    }
    if (!liff.isLoggedIn()) { renderLoggedOut(); return; }
    state.accessToken = liff.getAccessToken();
    await loadDashboard();
    if (state.currentEventId) {
      await enterEvent(state.currentEventId);
    }
  } catch (error) {
    renderLoggedOut();
    showMessage(`初始化失敗：${normalizeError(error)}`, true);
  } finally {
    els.appReady.style.display = 'block';
  }
}

function bindEvents() {
  els.loginBtn.addEventListener('click', signIn);
  els.logoutBtn.addEventListener('click', signOut);
  els.playIchibanBtn.addEventListener('click', playIchiban);
  els.refreshIchibanBtn.addEventListener('click', refreshEvent);
  els.leaveIchibanBtn.addEventListener('click', leaveEvent);
  window.addEventListener('beforeunload', () => { stopHeartbeat(); });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  renderLoggedOut();
  await bootstrap();
});
