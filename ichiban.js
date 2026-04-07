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
  refreshIchibanBtn: document.getElementById('refresh-ichiban-btn'),
  leaveIchibanBtn: document.getElementById('leave-ichiban-btn'),
  lockStatus: document.getElementById('ichiban-lock-status'),
  lockTimer: document.getElementById('ichiban-lock-timer'),
  historySection: document.getElementById('ichiban-history-section'),
  historyList: document.getElementById('ichiban-history-list'),
  vipOnlyNotice: document.getElementById('vip-only-notice'),
};

const state = {
  accessToken: null,
  dashboard: null,
  pending: new Set(),
  events: [],
  currentEventId: new URL(window.location.href).searchParams.get('eventId') || null,
  currentEvent: null,
  idleReleaseTimeout: null,
  lockCountdownInterval: null,
  activityKeepalivePromise: null,
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
  if (!text) {
    els.messageBox.style.display = 'none';
    return;
  }
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
function startPending(key) {
  if (state.pending.has(key)) throw new Error('上一個操作尚未完成');
  state.pending.add(key);
}
function endPending(key) { state.pending.delete(key); }
function getCleanAppUrl() { return `${window.location.origin}${window.location.pathname}`; }
function hasLiffRedirectParams() {
  const url = new URL(window.location.href);
  return url.searchParams.has('code') || url.searchParams.has('state') || url.searchParams.has('liffClientId') || url.searchParams.has('liffRedirectUri');
}
function makeRequestId(prefix) {
  return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`;
}

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
  if (els.vipOnlyNotice) els.vipOnlyNotice.style.display = 'none';
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

function isVipMember() {
  const member = state.dashboard?.member || {};
  return !!(member.is_admin || member.member_role === 'vip');
}

function renderVipDenied() {
  if (els.vipOnlyNotice) els.vipOnlyNotice.style.display = 'block';
  els.ichibanEventList.innerHTML = '<div class="empty-state">目前此功能僅開放 VIP 會員使用</div>';
  els.ichibanDetailSection.style.display = 'none';
  els.historySection.style.display = 'none';
}

function renderEventList() {
  if (!isVipMember()) {
    renderVipDenied();
    return;
  }
  if (els.vipOnlyNotice) els.vipOnlyNotice.style.display = 'none';
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

function getRemainingLockSeconds() {
  const lockedUntil = state.currentEvent?.lock_status?.locked_until ? new Date(state.currentEvent.lock_status.locked_until).getTime() : 0;
  if (!lockedUntil) return 0;
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

function stopLockTimers() {
  if (state.idleReleaseTimeout) {
    window.clearTimeout(state.idleReleaseTimeout);
    state.idleReleaseTimeout = null;
  }
  if (state.lockCountdownInterval) {
    window.clearInterval(state.lockCountdownInterval);
    state.lockCountdownInterval = null;
  }
}

function updateLockStatusUi() {
  const lock = state.currentEvent?.lock_status;
  if (!lock) {
    els.lockStatus.textContent = '未進入';
    els.lockStatus.className = 'status-chip idle';
    els.lockTimer.textContent = '-';
    els.lockTimer.className = 'status-chip idle';
    return;
  }

  if (lock.is_locked && lock.is_mine) {
    els.lockStatus.textContent = '你已鎖定活動，可直接點籤抽獎';
    els.lockStatus.className = 'status-chip busy';
    const remain = getRemainingLockSeconds();
    els.lockTimer.textContent = remain > 0 ? `鎖定倒數 ${remain}s` : '鎖定已到期';
    els.lockTimer.className = `status-chip ${remain > 0 ? 'busy' : 'idle'}`;
    return;
  }

  if (lock.is_locked && !lock.is_mine) {
    els.lockStatus.textContent = `鎖定中：${lock.locked_by_display_name || '其他玩家'}`;
    els.lockStatus.className = 'status-chip busy';
    const remain = getRemainingLockSeconds();
    els.lockTimer.textContent = remain > 0 ? `約 ${remain}s 後可進入` : '可重新整理';
    els.lockTimer.className = 'status-chip idle';
    return;
  }

  els.lockStatus.textContent = '目前未鎖定';
  els.lockStatus.className = 'status-chip idle';
  els.lockTimer.textContent = '可直接抽獎';
  els.lockTimer.className = 'status-chip idle';
}

function startLockCountdown() {
  if (!state.currentEvent?.lock_status?.is_mine) {
    stopLockTimers();
    updateLockStatusUi();
    return;
  }

  stopLockTimers();
  updateLockStatusUi();

  const remainMs = Math.max(0, (new Date(state.currentEvent.lock_status.locked_until).getTime() || 0) - Date.now());
  state.idleReleaseTimeout = window.setTimeout(async () => {
    try {
      if (!state.currentEventId) return;
      await callApi('release_ichiban_lock', { eventId: state.currentEventId });
      await openEvent(state.currentEventId, { silent: true });
      showMessage('你太久沒有下一步操作，系統已自動解除鎖定。', true);
    } catch {
      // ignore network errors here; TTL in DB still protects the lock expiry.
    }
  }, remainMs + 800);

  state.lockCountdownInterval = window.setInterval(() => {
    updateLockStatusUi();
    if (getRemainingLockSeconds() <= 0) {
      stopLockTimers();
    }
  }, 1000);
}

function renderCurrentEvent() {
  const event = state.currentEvent;
  if (!event) {
    els.ichibanDetailSection.style.display = 'none';
    els.historySection.style.display = 'none';
    updateLockStatusUi();
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
  updateLockStatusUi();
  startLockCountdown();
}

function renderTickets(tickets) {
  if (!tickets.length) {
    els.ticketGrid.innerHTML = '<div class="empty-state">沒有可用籤紙</div>';
    return;
  }

  els.ticketGrid.innerHTML = tickets.map((ticket) => {
    const classes = ['ticket-tile'];
    if (ticket.status === 'drawn') classes.push('drawn');
    if (ticket.status === 'drawn' && ticket.drawn_by_me) classes.push('mine');

    const resultHtml = ticket.status === 'drawn'
      ? `<span class="ticket-result">${escapeHtml(ticket.result_label || '未中獎')}</span>`
      : `<span class="ticket-label">${escapeHtml(ticket.display_no)}</span>`;

    const subHtml = ticket.status === 'drawn'
      ? `<span class="ticket-no">${escapeHtml(ticket.display_no)}</span>`
      : '';

    const disabled = ticket.status !== 'available' ? 'disabled' : '';
    return `<button class="${classes.join(' ')}" type="button" data-ticket-id="${escapeHtml(ticket.id)}" data-ticket-no="${escapeHtml(ticket.display_no)}" ${disabled}>${subHtml}${resultHtml}</button>`;
  }).join('');

  els.ticketGrid.querySelectorAll('.ticket-tile:not(.drawn)').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!state.currentEventId || !state.currentEvent) return;
      if (!state.currentEvent.lock_status?.is_mine) {
        showMessage('請先取得活動鎖定後再抽。', true);
        return;
      }

      try {
        await extendMyLock('select-ticket');
      } catch (error) {
        showMessage(normalizeError(error, '鎖定已失效，請重新進入活動'), true);
        await refreshEvent();
        return;
      }

      const ticketNo = btn.dataset.ticketNo || '';
      const ok = window.confirm(`確定抽 ${ticketNo} 號籤嗎？\n本次會扣除 ${state.currentEvent.point_cost} 點。`);
      if (!ok) {
        showMessage('已取消抽獎，你的活動鎖定仍保留。');
        return;
      }
      await playIchiban(btn.dataset.ticketId);
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

async function openEvent(eventId, options = {}) {
  if (!isVipMember()) throw new Error('此功能僅開放 VIP 會員');
  const data = await callApi('get_ichiban_event_detail', { eventId });
  state.currentEventId = eventId;
  state.currentEvent = data.event;
  renderCurrentEvent();
  const url = new URL(window.location.href);
  url.searchParams.set('eventId', eventId);
  window.history.replaceState({}, document.title, url.toString());
  if (!options.silent) clearMessage();
}

async function enterEvent(eventId) {
  if (!isVipMember()) {
    renderVipDenied();
    showMessage('此功能僅開放 VIP 會員', true);
    return;
  }
  const key = `enter:${eventId}`;
  try {
    startPending(key);
    clearMessage();
    await callApi('acquire_ichiban_lock', { eventId });
    await openEvent(eventId, { silent: true });
    showMessage('已進入活動，現在可以直接點籤紙抽獎。');
  } catch (error) {
    showMessage(normalizeError(error, '進入活動失敗'), true);
  } finally {
    endPending(key);
  }
}

async function leaveEvent(options = {}) {
  if (!state.currentEventId) return;
  stopLockTimers();
  try {
    await callApi('release_ichiban_lock', { eventId: state.currentEventId });
  } catch {
    // ignore best effort release
  }
  const releasedEventId = state.currentEventId;
  state.currentEvent = null;
  state.currentEventId = null;
  renderCurrentEvent();
  const url = new URL(window.location.href);
  url.searchParams.delete('eventId');
  window.history.replaceState({}, document.title, url.toString());
  if (!options.silent) showMessage('已離開活動並釋放鎖定');
  await loadDashboard();
  if (options.reopenEventId) {
    await enterEvent(options.reopenEventId);
  }
  return releasedEventId;
}

async function refreshEvent() {
  if (!state.currentEventId) return;
  try {
    await openEvent(state.currentEventId, { silent: true });
  } catch (error) {
    showMessage(normalizeError(error, '刷新活動失敗'), true);
  }
}

async function extendMyLock(reason = 'activity') {
  if (!state.currentEventId || !state.currentEvent?.lock_status?.is_mine) return;
  if (state.activityKeepalivePromise) return state.activityKeepalivePromise;
  state.activityKeepalivePromise = (async () => {
    const data = await callApi('keepalive_ichiban_lock', { eventId: state.currentEventId, reason });
    if (state.currentEvent?.lock_status) {
      state.currentEvent.lock_status.locked_until = data.locked_until || state.currentEvent.lock_status.locked_until;
      state.currentEvent.lock_status.is_locked = true;
      state.currentEvent.lock_status.is_mine = true;
    }
    startLockCountdown();
  })();
  try {
    await state.activityKeepalivePromise;
  } finally {
    state.activityKeepalivePromise = null;
  }
}

async function playIchiban(ticketId) {
  const key = 'playIchiban';
  try {
    startPending(key);
    clearMessage();
    if (!state.currentEventId || !ticketId) throw new Error('請先選擇籤紙');
    const result = await callApi('play_ichiban', {
      eventId: state.currentEventId,
      ticketId,
      requestId: makeRequestId('ichiban-play'),
    });
    showMessage(`抽獎成功：你抽到 ${result.result?.prize_name || '未中獎'}，已扣 ${result.result?.points_spent || 0} 點`);
    await loadDashboard();
    await openEvent(state.currentEventId, { silent: true });
  } catch (error) {
    showMessage(normalizeError(error, '抽獎失敗'), true);
    await refreshEvent();
  } finally {
    endPending(key);
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
  await leaveEvent({ silent: true });
  if (window.liff && liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.dashboard = null;
  renderLoggedOut();
  showMessage('已登出');
}

async function bootstrap() {
  try {
    const config = getConfig();
    if (!config.liffId || !config.supabaseUrl || !config.supabaseAnonKey || !config.apiFunctionName) {
      throw new Error('請先設定 config.js');
    }

    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: false });

    if (!liff.isLoggedIn()) {
      renderLoggedOut();
      if (hasLiffRedirectParams()) {
        const url = new URL(window.location.href);
        ['code', 'state', 'liffClientId', 'liffRedirectUri'].forEach((key) => url.searchParams.delete(key));
        window.history.replaceState({}, document.title, url.toString());
      }
      return;
    }

    state.accessToken = liff.getAccessToken();
    await loadDashboard();

    if (state.currentEventId && isVipMember()) {
      try {
        await enterEvent(state.currentEventId);
      } catch {
        await refreshEvent();
      }
    }
  } catch (error) {
    renderLoggedOut();
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.refreshIchibanBtn?.addEventListener('click', async () => {
  try {
    await extendMyLock('manual-refresh');
  } catch {}
  await refreshEvent();
  showMessage('活動資料已更新');
});
els.leaveIchibanBtn?.addEventListener('click', () => leaveEvent());

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') return;
  if (state.currentEventId) await refreshEvent();
});

window.addEventListener('pagehide', () => {
  stopLockTimers();
});

bootstrap();
