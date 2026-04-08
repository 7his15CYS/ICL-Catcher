function getConfig() { return window.APP_CONFIG || {}; }
const qs = new URLSearchParams(window.location.search);
const state = {
  accessToken: null,
  member: null,
  campaigns: [],
  currentCampaignId: qs.get('campaignId') ? Number(qs.get('campaignId')) : null,
  currentDetail: null,
  countdownTimer: null,
  drawing: false,
  autoRefreshTimer: null,
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
  refreshCampaignsBtn: document.getElementById('refresh-campaigns-btn'),
  prizeList: document.getElementById('prize-list'),
  ticketHint: document.getElementById('ticket-hint'),
  turnStatusInline: document.getElementById('turn-status-inline'),
  ticketWall: document.getElementById('ticket-wall'),
  ticketProgress: document.getElementById('ticket-progress'),
};

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeError(err, fallback = '發生錯誤') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object') return err.message || err.error || fallback;
  return String(err);
}

function showMessage(message, isError = false) {
  const text = normalizeError(message, '');
  if (!text) {
    els.messageBox.style.display = 'none';
    return;
  }
  els.messageBox.textContent = text;
  els.messageBox.style.display = 'block';
  els.messageBox.className = isError ? 'message error' : 'message success';
}

function clearMessage() { showMessage(''); }
function padTicketNo(value) { return String(Number(value)).padStart(3, '0'); }
function makeRequestId(prefix) { return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`; }
function getCleanAppUrl() { return `${window.location.origin}${window.location.pathname}${window.location.search}`; }

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

function getStorageKey() {
  return `kuji-revealed-v2:${state.currentCampaignId || 'none'}`;
}

function loadRevealedMap() {
  try {
    const raw = window.sessionStorage.getItem(getStorageKey());
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveRevealedMap(map) {
  try {
    window.sessionStorage.setItem(getStorageKey(), JSON.stringify(map));
  } catch {
    // ignore storage failure
  }
}

function getRevealedCount() {
  return Object.keys(loadRevealedMap()).length;
}

function rememberDrawResult(row) {
  const map = loadRevealedMap();
  const ticketNo = padTicketNo(row.ticket_no);
  map[ticketNo] = {
    ticket_no: ticketNo,
    prize_code: row.prize_code || '',
    prize_name: row.prize_name || '未中獎',
    is_win: Boolean((row.prize_code || '').trim()),
  };
  saveRevealedMap(map);
}

function getConsumedUnknownTicketNos(totalTickets, remainingTickets, revealedMap) {
  const consumedCount = Math.max(0, totalTickets - remainingTickets);
  const knownConsumed = Object.keys(revealedMap).length;
  const unknownConsumedCount = Math.max(0, consumedCount - knownConsumed);
  if (!unknownConsumedCount) return new Set();

  const result = new Set();
  for (let n = totalTickets; n >= 1 && result.size < unknownConsumedCount; n -= 1) {
    const key = padTicketNo(n);
    if (!revealedMap[key]) result.add(key);
  }
  return result;
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
      <div class="campaign-row-sub">${Number(c.points_per_draw || 0)} 點 / 張 ・ 剩餘 ${Number(c.remaining_tickets || 0)} / ${Number(c.total_tickets || 0)}</div>
    </button>`).join('');
  els.campaignList.querySelectorAll('.campaign-row').forEach((btn) => btn.addEventListener('click', () => openCampaign(Number(btn.dataset.id))));
}

function stopCountdown() {
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
    state.countdownTimer = null;
  }
}

function stopAutoRefresh() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
}

function getTurnSecondsLeft() {
  const expires = state.currentDetail?.turn?.holder_expires_at;
  if (!expires) return 0;
  return Math.max(0, Math.ceil((new Date(expires).getTime() - Date.now()) / 1000));
}

function renderTurnInline() {
  const detail = state.currentDetail;
  if (!detail) return;
  const turn = detail.turn || {};
  const left = getTurnSecondsLeft();
  const mine = Boolean(turn.my_turn && left > 0);
  const occupied = Boolean(turn.occupied_by_other && left > 0);

  if (!state.accessToken) {
    els.ticketHint.textContent = '請先登入，登入後可直接點籤翻牌。';
    els.turnStatusInline.textContent = '';
    return;
  }

  if (state.drawing) {
    els.ticketHint.textContent = '抽籤中，請稍候…';
    return;
  }

  if (mine) {
    els.ticketHint.textContent = '現在輪到你，可直接連續點籤翻開。';
    els.turnStatusInline.textContent = `你的操作保留中，剩餘 ${left} 秒。`;
  } else if (occupied) {
    els.ticketHint.textContent = '目前有人正在操作，暫時不能翻籤。';
    els.turnStatusInline.textContent = `由 ${turn.holder_nickname || '其他玩家'} 操作中，約 ${left} 秒後可再試。`;
  } else {
    els.ticketHint.textContent = '直接點任一張可抽的籤紙即可翻開。';
    els.turnStatusInline.textContent = '目前沒有人持有操作回合。';
  }
}

function startTimers() {
  stopCountdown();
  stopAutoRefresh();
  renderTurnInline();
  state.countdownTimer = setInterval(async () => {
    renderTurnInline();
    if (getTurnSecondsLeft() <= 0) {
      stopCountdown();
      await refreshCurrentCampaign(true);
    }
  }, 1000);
  state.autoRefreshTimer = setInterval(() => refreshCurrentCampaign(true).catch(() => {}), 15000);
}

function createTicketButton(ticketNo, type, contentHtml, disabled = false) {
  return `
    <button class="ticket-card ticket-${type}" type="button" data-ticket-no="${ticketNo}" ${disabled ? 'disabled' : ''}>
      ${contentHtml}
    </button>`;
}

function renderTicketWall() {
  const detail = state.currentDetail;
  if (!detail) {
    els.ticketWall.innerHTML = '<div class="empty-state">請先選擇活動</div>';
    return;
  }
  const campaign = detail.campaign || {};
  const totalTickets = Number(campaign.total_tickets || 0);
  const remainingTickets = Number(campaign.remaining_tickets || 0);
  const revealedMap = loadRevealedMap();
  const consumedUnknownNos = getConsumedUnknownTicketNos(totalTickets, remainingTickets, revealedMap);
  const myOpenedCount = Object.keys(revealedMap).length;
  const consumedCount = Math.max(0, totalTickets - remainingTickets);

  els.ticketProgress.textContent = `總籤 ${totalTickets} 張 ・ 已抽出 ${consumedCount} 張 ・ 剩餘 ${remainingTickets} 張`;

  if (!totalTickets) {
    els.ticketWall.innerHTML = '<div class="empty-state">此活動尚未設定籤紙</div>';
    return;
  }

  const html = [];
  for (let n = 1; n <= totalTickets; n += 1) {
    const ticketNo = padTicketNo(n);
    const revealed = revealedMap[ticketNo];
    if (revealed) {
      const content = revealed.is_win
        ? `<span class="ticket-no">${ticketNo}</span><span class="ticket-main">${escapeHtml(revealed.prize_code)}</span><span class="ticket-sub">${escapeHtml(revealed.prize_name)}</span>`
        : `<span class="ticket-no">${ticketNo}</span><span class="ticket-main">未中獎</span><span class="ticket-sub">謝謝參與</span>`;
      html.push(createTicketButton(ticketNo, revealed.is_win ? 'win' : 'lose', content, true));
      continue;
    }

    if (consumedUnknownNos.has(ticketNo)) {
      html.push(createTicketButton(ticketNo, 'used', `<span class="ticket-no">${ticketNo}</span><span class="ticket-main">已抽出</span><span class="ticket-sub">非本次翻牌紀錄</span>`, true));
      continue;
    }

    const blockedByOther = Boolean(state.currentDetail?.turn?.occupied_by_other && getTurnSecondsLeft() > 0);
    const drawingLocked = state.drawing;
    const disabled = blockedByOther || drawingLocked || !state.accessToken;
    html.push(createTicketButton(ticketNo, 'closed', `<span class="ticket-index">${ticketNo}</span>`, disabled));
  }

  els.ticketWall.innerHTML = html.join('');
  els.ticketWall.querySelectorAll('.ticket-card.ticket-closed').forEach((button) => {
    button.addEventListener('click', () => handleTicketClick(button.dataset.ticketNo));
  });

  const footerNote = myOpenedCount
    ? `<div class="ticket-session-note">你本頁已翻開 ${myOpenedCount} 張。重新整理後仍會保留你本次瀏覽器的翻牌結果。</div>`
    : '';
  els.ticketWall.insertAdjacentHTML('beforeend', footerNote);
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
  els.campaignImage.src = campaign.cover_image_url || 'https://placehold.co/900x500?text=KUJI';
  els.campaignDescription.textContent = campaign.description || '暫無活動說明';
  els.campaignStatusBadge.textContent = campaign.status || '-';
  els.campaignStatusBadge.className = `status-chip ${campaign.status === 'active' ? 'busy' : 'idle'}`;
  const hold = Number(campaign.turn_hold_seconds ?? campaign.reserve_seconds ?? 0);
  els.campaignStats.innerHTML = `
    <div class="stat-chip">每抽 ${Number(campaign.points_per_draw || 0)} 點</div>
    <div class="stat-chip">總籤數 ${Number(campaign.total_tickets || 0)}</div>
    <div class="stat-chip">剩餘 ${Number(campaign.remaining_tickets || 0)}</div>
    <div class="stat-chip">保留 ${hold} 秒</div>`;

  const prizes = detail.prizes || [];
  els.prizeList.innerHTML = prizes.length
    ? prizes.map((p) => `
      <article class="prize-card compact-prize-card">
        <img class="prize-image" src="${escapeHtml(p.prize_image_url || 'https://placehold.co/240x180?text=Prize')}" alt="${escapeHtml(p.prize_name)}">
        <div class="prize-body">
          <div class="prize-code">${escapeHtml(p.prize_code)}</div>
          <h4>${escapeHtml(p.prize_name)}</h4>
          <div class="prize-meta">剩餘 ${Number(p.remaining_quantity || 0)} / 共 ${Number(p.total_quantity || 0)}</div>
        </div>
      </article>`).join('')
    : '<div class="empty-state">尚未設定獎項</div>';

  renderTurnInline();
  renderTicketWall();
  startTimers();
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
  renderCampaignList();
  if (state.currentCampaignId && !state.campaigns.some((c) => Number(c.id) === Number(state.currentCampaignId))) {
    state.currentCampaignId = state.campaigns[0] ? Number(state.campaigns[0].id) : null;
  }
  if (!state.currentCampaignId && state.campaigns[0]) state.currentCampaignId = Number(state.campaigns[0].id);
  if (state.currentCampaignId) await openCampaign(state.currentCampaignId, true);
}

async function openCampaign(campaignId, silent = false) {
  state.currentCampaignId = campaignId;
  const data = await callApi('get_kuji_campaign_detail', { campaignId }, !!state.accessToken);
  state.currentDetail = data;
  renderCampaignList();
  renderCurrentCampaign();
  const url = new URL(window.location.href);
  url.searchParams.set('campaignId', String(campaignId));
  window.history.replaceState({}, document.title, url.toString());
  if (!silent) clearMessage();
}

async function refreshCurrentCampaign(silent = false) {
  if (!state.currentCampaignId) return;
  await openCampaign(state.currentCampaignId, silent);
}

async function ensureTurnReady() {
  const turn = state.currentDetail?.turn || {};
  const left = getTurnSecondsLeft();
  if (turn.my_turn && left > 0) return;
  if (turn.occupied_by_other && left > 0) {
    throw new Error(`目前由 ${turn.holder_nickname || '其他玩家'} 操作中，請稍後再試。`);
  }
  await callApi('claim_kuji_turn', { campaignId: state.currentCampaignId });
  await refreshCurrentCampaign(true);
}

async function handleTicketClick(clickedTicketNo) {
  if (state.drawing) return;
  if (!state.accessToken) {
    showMessage('請先使用 LINE 登入，再點籤翻牌。', true);
    return;
  }

  state.drawing = true;
  clearMessage();
  renderTurnInline();
  renderTicketWall();

  try {
    await ensureTurnReady();
    const result = await callApi('draw_kuji_with_points', {
      campaignId: state.currentCampaignId,
      drawCount: 1,
      requestId: makeRequestId(`ticket-${clickedTicketNo}`),
    });
    const rows = Array.isArray(result.results)
      ? result.results
      : (Array.isArray(result.draw_results) ? result.draw_results : []);
    const firstRow = rows[0];
    if (!firstRow || !firstRow.ticket_no) {
      throw new Error('系統未回傳籤紙資料');
    }

    rememberDrawResult(firstRow);
    await loadDashboard();
    await refreshCurrentCampaign(true);

    const actualTicket = padTicketNo(firstRow.ticket_no);
    const hasPrize = Boolean((firstRow.prize_code || '').trim());
    const revealMessage = actualTicket === clickedTicketNo
      ? `已翻開 ${actualTicket}：${hasPrize ? `${firstRow.prize_code} ${firstRow.prize_name}` : '未中獎'}`
      : `你點了 ${clickedTicketNo}，系統實際抽出 ${actualTicket}：${hasPrize ? `${firstRow.prize_code} ${firstRow.prize_name}` : '未中獎'}`;
    showMessage(revealMessage, false);
  } catch (error) {
    showMessage(normalizeError(error, '翻牌失敗'), true);
    await refreshCurrentCampaign(true);
  } finally {
    state.drawing = false;
    renderTurnInline();
    renderTicketWall();
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
  stopCountdown();
  stopAutoRefresh();
  if (window.liff && liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.member = null;
  renderMember(null);
  renderTurnInline();
  renderTicketWall();
  showMessage('已登出');
}

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
  } catch (error) {
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.refreshCampaignsBtn?.addEventListener('click', () => loadCampaigns().catch((e) => showMessage(normalizeError(e, '刷新活動失敗'), true)));
window.addEventListener('pagehide', () => {
  stopCountdown();
  stopAutoRefresh();
});
bootstrap();
