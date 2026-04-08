function getConfig() { return window.APP_CONFIG || {}; }
const qs = new URLSearchParams(window.location.search);
const state = {
  accessToken: null,
  member: null,
  campaigns: [],
  currentCampaignId: qs.get('campaignId') ? Number(qs.get('campaignId')) : null,
  currentDetail: null,
  ticketWall: [],
  revealingTicketNo: null,
  turnTickTimer: null,
  syncTimer: null,
  isRefreshingDetail: false,
};
const els = {
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  messageBox: document.getElementById('message-box'),
  memberSection: document.getElementById('member-section'),
  memberAvatar: document.getElementById('member-avatar'),
  memberName: document.getElementById('member-name'),
  memberPoints: document.getElementById('member-points'),
  campaignList: document.getElementById('campaign-list'),
  campaignEmpty: document.getElementById('campaign-empty'),
  campaignDetail: document.getElementById('campaign-detail'),
  campaignTitle: document.getElementById('campaign-title'),
  campaignStatusBadge: document.getElementById('campaign-status-badge'),
  campaignImage: document.getElementById('campaign-image'),
  campaignDescription: document.getElementById('campaign-description'),
  campaignStats: document.getElementById('campaign-stats'),
  prizeList: document.getElementById('prize-list'),
  refreshCampaignsBtn: document.getElementById('refresh-campaigns-btn'),
  refreshWallBtn: document.getElementById('refresh-wall-btn'),
  releaseTurnBtn: document.getElementById('release-turn-btn'),
  ticketWallSummary: document.getElementById('ticket-wall-summary'),
  ticketGrid: document.getElementById('ticket-grid'),
  turnPanel: document.getElementById('turn-panel'),
  turnStatusTitle: document.getElementById('turn-status-title'),
  turnStatusText: document.getElementById('turn-status-text'),
  turnCountdown: document.getElementById('turn-countdown'),
};

function escapeHtml(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function normalizeError(err, fallback = '發生錯誤') { if (err == null) return fallback; if (typeof err === 'string') return err; if (err instanceof Error) return err.message || fallback; if (typeof err === 'object') return err.message || err.error || fallback; return String(err); }
function showMessage(message, isError = false) { const text = normalizeError(message, ''); if (!text) { els.messageBox.style.display = 'none'; return; } els.messageBox.textContent = text; els.messageBox.style.display = 'block'; els.messageBox.className = isError ? 'message error' : 'message success'; }
function clearMessage() { showMessage(''); }
function setButtonLoading(button, loading, label = '處理中...') { if (!button) return; if (!button.dataset.originalText) button.dataset.originalText = button.textContent || ''; button.disabled = loading; button.textContent = loading ? label : button.dataset.originalText; }
function makeRequestId(prefix) { return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`; }
function getCleanAppUrl() { return `${window.location.origin}${window.location.pathname}${window.location.search}`; }
function formatTicketNo(v) { return String(v ?? '').padStart(3, '0'); }
function nowTs() { return Date.now(); }
function hasLoggedIn() { return Boolean(state.accessToken && state.member); }
function getTurn() { return state.currentDetail?.turn || null; }
function getCampaign() { return state.currentDetail?.campaign || null; }
function getRemainingSeconds() {
  const turn = getTurn();
  const expiresAt = turn?.holder_expires_at;
  if (!expiresAt) return 0;
  const diffMs = new Date(expiresAt).getTime() - nowTs();
  return Math.max(0, Math.ceil(diffMs / 1000));
}
async function callApi(action, payload = {}, includeToken = true) {
  const c = getConfig();
  const body = { action, ...payload };
  if (includeToken && state.accessToken) body.accessToken = state.accessToken;
  const res = await fetch(`${c.supabaseUrl}/functions/v1/${c.apiFunctionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: c.supabaseAnonKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok || data.ok === false) throw data;
  return data;
}

function renderMember(member, points) {
  if (!member) {
    els.memberSection.style.display = 'none';
    els.loginBtn.style.display = 'inline-flex';
    els.logoutBtn.style.display = 'none';
    return;
  }
  els.memberSection.style.display = 'block';
  els.loginBtn.style.display = 'none';
  els.logoutBtn.style.display = 'inline-flex';
  els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  els.memberAvatar.src = member.avatar_url || 'https://placehold.co/96x96?text=User';
  els.memberPoints.textContent = String(points ?? member.current_points ?? 0);
}

function renderCampaignList() {
  if (!state.campaigns.length) {
    els.campaignList.innerHTML = '<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.campaignList.innerHTML = state.campaigns.map((c) => `
    <button class="campaign-row ${state.currentCampaignId === Number(c.id) ? 'active' : ''}" data-id="${c.id}" type="button">
      <div class="campaign-row-title">${escapeHtml(c.title)}</div>
      <div class="campaign-row-sub">${Number(c.points_per_draw || 0)} 點 / 張 ・ 剩餘 ${Number(c.remaining_tickets || 0)} 張</div>
    </button>`).join('');
  els.campaignList.querySelectorAll('.campaign-row').forEach((btn) => btn.addEventListener('click', () => openCampaign(Number(btn.dataset.id))));
}

function renderPrizeList(prizes) {
  els.prizeList.innerHTML = prizes.length
    ? prizes.map((p) => `
      <article class="prize-card">
        <img class="prize-image" src="${escapeHtml(p.prize_image_url || 'https://placehold.co/240x180?text=Prize')}" alt="${escapeHtml(p.prize_name)}">
        <div class="prize-body">
          <div class="prize-code">${escapeHtml(p.prize_code)}</div>
          <h4>${escapeHtml(p.prize_name)}</h4>
          <div class="prize-meta">剩餘 ${Number(p.remaining_quantity || 0)} / 共 ${Number(p.total_quantity || 0)}</div>
        </div>
      </article>`).join('')
    : '<div class="empty-state">尚未設定獎項</div>';
}

function buildTicketInner(ticket) {
  const ticketNo = formatTicketNo(ticket.ticket_no);
  if (!ticket.is_revealed) {
    return `<span class="ticket-label">${ticketNo}</span>`;
  }
  if (ticket.is_winning) {
    return `<span class="ticket-no">${ticketNo}</span><span class="ticket-result"><strong>${escapeHtml(ticket.prize_code || '')}</strong><br>${escapeHtml(ticket.prize_name || '')}</span>`;
  }
  return `<span class="ticket-no">${ticketNo}</span><span class="ticket-result">未中獎</span>`;
}

function renderTurnPanel() {
  const turn = getTurn();
  const campaign = getCampaign();
  const holdSeconds = Number(campaign?.turn_hold_seconds || 0);
  const remaining = getRemainingSeconds();

  let panelClass = 'turn-panel waiting';
  let title = '尚未鎖定回合';
  let text = hasLoggedIn()
    ? `點選任一張籤紙後，系統才會開始為你保留 ${holdSeconds || 0} 秒。`
    : '請先登入後再點選籤紙。登入前不會鎖定回合。';
  let countdown = holdSeconds > 0 ? `${holdSeconds} 秒` : '--';
  let showRelease = false;

  if (turn?.my_turn && remaining > 0) {
    panelClass = 'turn-panel mine';
    title = '目前由你操作';
    text = `剩餘 ${remaining} 秒。你可以繼續翻下一張；每翻開一張，保留時間會重置。也可按下方按鈕退出並釋放回合。`;
    countdown = `${remaining} 秒`;
    showRelease = true;
  } else if (turn?.occupied_by_other && remaining > 0) {
    panelClass = 'turn-panel other';
    title = '目前由其他會員操作中';
    text = `${turn.holder_nickname || '其他會員'} 尚在保留時間內，剩餘 ${remaining} 秒。倒數結束或對方退出後，你就可以點籤。`;
    countdown = `${remaining} 秒`;
  }

  els.turnPanel.className = panelClass;
  els.turnStatusTitle.textContent = title;
  els.turnStatusText.textContent = text;
  els.turnCountdown.textContent = countdown;
  els.releaseTurnBtn.style.display = showRelease ? 'inline-flex' : 'none';
}

function renderTicketWall() {
  const tickets = Array.isArray(state.ticketWall) ? state.ticketWall : [];
  const revealedCount = tickets.filter((t) => t.is_revealed).length;
  const totalCount = tickets.length;
  const winningCount = tickets.filter((t) => t.is_revealed && t.is_winning).length;
  const turn = getTurn();
  const occupiedByOther = Boolean(turn?.occupied_by_other && getRemainingSeconds() > 0);

  els.ticketWallSummary.textContent = totalCount
    ? `共 ${totalCount} 張籤紙，已翻開 ${revealedCount} 張，中獎 ${winningCount} 張。`
    : '目前沒有可顯示的籤紙。';

  if (!totalCount) {
    els.ticketGrid.innerHTML = '<div class="empty-state">目前沒有可顯示的籤紙</div>';
    return;
  }

  els.ticketGrid.innerHTML = tickets.map((ticket) => {
    const isBusy = state.revealingTicketNo === Number(ticket.ticket_no);
    const classes = ['ticket-tile', 'direct-ticket-tile'];
    if (ticket.is_revealed) classes.push(ticket.is_winning ? 'revealed-win' : 'revealed-miss');
    if (isBusy) classes.push('is-loading');
    const disabled = ticket.is_revealed || isBusy || occupiedByOther;
    return `<button class="${classes.join(' ')}" data-ticket-no="${escapeHtml(ticket.ticket_no)}" type="button" ${disabled ? 'disabled' : ''}>${buildTicketInner(ticket)}</button>`;
  }).join('');

  els.ticketGrid.querySelectorAll('[data-ticket-no]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ticketNo = Number(btn.dataset.ticketNo);
      if (!Number.isInteger(ticketNo)) return;
      await revealTicket(ticketNo);
    });
  });
}

function renderCurrentCampaign() {
  const detail = state.currentDetail;
  if (!detail) {
    els.campaignEmpty.style.display = 'block';
    els.campaignDetail.style.display = 'none';
    return;
  }

  const campaign = detail.campaign || {};
  els.campaignEmpty.style.display = 'none';
  els.campaignDetail.style.display = 'block';
  els.campaignTitle.textContent = campaign.title || '-';
  els.campaignImage.src = campaign.cover_image_url || 'https://placehold.co/1200x600?text=KUJI';
  els.campaignDescription.textContent = campaign.description || '暫無活動說明';
  els.campaignStatusBadge.textContent = campaign.status || '-';
  els.campaignStatusBadge.className = `status-chip ${campaign.status === 'active' ? 'busy' : 'idle'}`;
  els.campaignStats.innerHTML = `
    <div class="stat-chip">每抽 ${Number(campaign.points_per_draw || 0)} 點</div>
    <div class="stat-chip">總籤數 ${Number(campaign.total_tickets || 0)}</div>
    <div class="stat-chip">剩餘 ${Number(campaign.remaining_tickets || 0)}</div>
    <div class="stat-chip">保留 ${Number(campaign.turn_hold_seconds || 0)} 秒</div>`;
  renderPrizeList(detail.prizes || []);
  renderTurnPanel();
  renderTicketWall();
}

function applyCampaignDetail(detail) {
  state.currentDetail = detail;
  renderCurrentCampaign();
}

async function loadDashboard() {
  if (!state.accessToken) return;
  const data = await callApi('login');
  state.member = data.member;
  renderMember(data.member, data.points);
}

async function loadCampaigns() {
  const data = await callApi('get_kuji_campaigns', {}, false);
  state.campaigns = data.campaigns || [];
  if (state.currentCampaignId && !state.campaigns.some((c) => Number(c.id) === Number(state.currentCampaignId))) {
    state.currentCampaignId = state.campaigns[0] ? Number(state.campaigns[0].id) : null;
  }
  if (!state.currentCampaignId && state.campaigns[0]) state.currentCampaignId = Number(state.campaigns[0].id);
  renderCampaignList();
  if (state.currentCampaignId) await openCampaign(state.currentCampaignId, true);
}

async function refreshCampaignDetail() {
  if (!state.currentCampaignId || state.isRefreshingDetail) return;
  state.isRefreshingDetail = true;
  try {
    const detail = await callApi('get_kuji_campaign_detail', { campaignId: state.currentCampaignId }, !!state.accessToken);
    applyCampaignDetail(detail);
  } finally {
    state.isRefreshingDetail = false;
  }
}

async function loadTicketWall() {
  if (!state.currentCampaignId) return;
  const data = await callApi('get_kuji_ticket_wall', { campaignId: state.currentCampaignId }, !!state.accessToken);
  state.ticketWall = data.tickets || [];
  if (state.currentDetail?.campaign && data.campaign) {
    state.currentDetail.campaign = { ...state.currentDetail.campaign, ...data.campaign };
  }
  renderTicketWall();
}

async function refreshCurrentCampaignData({ silent = false } = {}) {
  if (!state.currentCampaignId) return;
  const [detail, wall] = await Promise.all([
    callApi('get_kuji_campaign_detail', { campaignId: state.currentCampaignId }, !!state.accessToken),
    callApi('get_kuji_ticket_wall', { campaignId: state.currentCampaignId }, !!state.accessToken),
  ]);
  state.currentDetail = detail;
  state.ticketWall = wall.tickets || [];
  if (detail?.campaign && wall?.campaign) state.currentDetail.campaign = { ...detail.campaign, ...wall.campaign };
  renderCurrentCampaign();
  if (!silent) clearMessage();
}

async function openCampaign(campaignId, silent = false) {
  state.currentCampaignId = campaignId;
  await refreshCurrentCampaignData({ silent: true });
  renderCampaignList();
  const url = new URL(window.location.href);
  url.searchParams.set('campaignId', String(campaignId));
  window.history.replaceState({}, document.title, url.toString());
  if (!silent) clearMessage();
}

function restartTurnTicker() {
  if (state.turnTickTimer) clearInterval(state.turnTickTimer);
  state.turnTickTimer = window.setInterval(async () => {
    renderTurnPanel();
    const remaining = getRemainingSeconds();
    if (remaining <= 0 && state.currentCampaignId) {
      await refreshCurrentCampaignData({ silent: true }).catch(() => {});
    }
  }, 1000);
}

function restartSyncTimer() {
  if (state.syncTimer) clearInterval(state.syncTimer);
  state.syncTimer = window.setInterval(async () => {
    if (!state.currentCampaignId || document.hidden) return;
    await refreshCurrentCampaignData({ silent: true }).catch(() => {});
  }, 4000);
}

async function revealTicket(ticketNo) {
  if (!state.currentCampaignId) return;
  if (!state.accessToken) {
    showMessage('請先使用 LINE 登入後再翻開籤紙', true);
    return;
  }
  const turn = getTurn();
  if (turn?.occupied_by_other && getRemainingSeconds() > 0) {
    showMessage('目前由其他會員操作中，請等倒數結束或對方退出。', true);
    return;
  }
  try {
    state.revealingTicketNo = ticketNo;
    renderTicketWall();
    clearMessage();
    const result = await callApi('reveal_kuji_ticket', {
      campaignId: state.currentCampaignId,
      ticketNo,
      requestId: makeRequestId(`kuji-ticket-${ticketNo}`),
    });
    if (result.points != null && state.member) {
      state.member.current_points = result.points;
      renderMember(state.member, result.points);
    } else {
      await loadDashboard();
    }
    await refreshCurrentCampaignData({ silent: true });
    showMessage(result.message || '已翻開籤紙');
  } catch (error) {
    showMessage(normalizeError(error, '翻開籤紙失敗'), true);
    await refreshCurrentCampaignData({ silent: true }).catch(() => {});
  } finally {
    state.revealingTicketNo = null;
    renderCurrentCampaign();
  }
}

async function releaseTurn() {
  if (!state.currentCampaignId || !state.accessToken) return;
  try {
    setButtonLoading(els.releaseTurnBtn, true, '釋放中...');
    clearMessage();
    const result = await callApi('release_kuji_turn', { campaignId: state.currentCampaignId });
    await refreshCurrentCampaignData({ silent: true });
    showMessage(result.message || '已釋放回合');
  } catch (error) {
    showMessage(normalizeError(error, '釋放回合失敗'), true);
    await refreshCurrentCampaignData({ silent: true }).catch(() => {});
  } finally {
    setButtonLoading(els.releaseTurnBtn, false);
  }
}

async function signIn() { if (!liff.isLoggedIn()) { liff.login({ redirectUri: getCleanAppUrl() }); return; } await bootstrap(); }
async function signOut() { if (window.liff && liff.isLoggedIn()) liff.logout(); state.accessToken = null; state.member = null; renderMember(null); await refreshCurrentCampaignData({ silent: true }).catch(() => {}); showMessage('已登出'); }

async function bootstrap() {
  try {
    const c = getConfig();
    if (!c.liffId || !c.supabaseUrl || !c.supabaseAnonKey || !c.apiFunctionName) throw new Error('請先設定 config.js');
    await liff.init({ liffId: c.liffId, withLoginOnExternalBrowser: false });
    if (liff.isLoggedIn()) {
      state.accessToken = liff.getAccessToken();
      await loadDashboard();
    } else {
      renderMember(null);
    }
    await loadCampaigns();
    restartTurnTicker();
    restartSyncTimer();
  } catch (error) {
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.refreshCampaignsBtn?.addEventListener('click', () => loadCampaigns().catch((e) => showMessage(normalizeError(e, '刷新活動失敗'), true)));
els.refreshWallBtn?.addEventListener('click', () => refreshCurrentCampaignData({ silent: true }).catch((e) => showMessage(normalizeError(e, '刷新籤紙失敗'), true)));
els.releaseTurnBtn?.addEventListener('click', releaseTurn);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCurrentCampaignData({ silent: true }).catch(() => {}); });
window.addEventListener('beforeunload', () => { if (state.turnTickTimer) clearInterval(state.turnTickTimer); if (state.syncTimer) clearInterval(state.syncTimer); });
bootstrap();
