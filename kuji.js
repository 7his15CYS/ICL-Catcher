function getConfig() { return window.APP_CONFIG || {}; }

const els = {
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  messageBox: document.getElementById('message-box'),
  memberSection: document.getElementById('member-section'),
  memberName: document.getElementById('member-name'),
  memberAvatar: document.getElementById('member-avatar'),
  memberPoints: document.getElementById('member-points'),
  campaignList: document.getElementById('campaign-list'),
  refreshCampaignsBtn: document.getElementById('refresh-campaigns-btn'),
  detailSection: document.getElementById('campaign-detail-section'),
  campaignTitle: document.getElementById('campaign-title'),
  campaignImage: document.getElementById('campaign-image'),
  campaignDescription: document.getElementById('campaign-description'),
  campaignStats: document.getElementById('campaign-stats'),
  turnStatus: document.getElementById('turn-status'),
  turnCountdown: document.getElementById('turn-countdown'),
  claimTurnBtn: document.getElementById('claim-turn-btn'),
  releaseTurnBtn: document.getElementById('release-turn-btn'),
  drawCountInput: document.getElementById('draw-count-input'),
  drawBtn: document.getElementById('draw-btn'),
  refreshDetailBtn: document.getElementById('refresh-detail-btn'),
  prizeList: document.getElementById('prize-list'),
  resultList: document.getElementById('result-list'),
};

const state = {
  accessToken: null,
  member: null,
  campaigns: [],
  currentCampaignId: Number(new URL(window.location.href).searchParams.get('campaignId') || 0) || null,
  currentDetail: null,
  refreshTimer: null,
  countdownTimer: null,
  pending: new Set(),
};

function normalizeError(err, fallback = '發生錯誤') {
  if (typeof err === 'string') return err;
  if (err?.message) return err.message;
  if (err?.error) return err.error;
  return fallback;
}
function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function showMessage(message, isError = false) {
  const text = message ? normalizeError(message) : '';
  els.messageBox.textContent = text;
  els.messageBox.style.display = text ? 'block' : 'none';
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
function makeRequestId(prefix) { return `${prefix}-${window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now()}`; }

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

function renderMemberSection() {
  if (!state.member) {
    els.memberSection.style.display = 'none';
    els.loginBtn.style.display = 'inline-flex';
    els.logoutBtn.style.display = 'none';
    return;
  }
  els.memberSection.style.display = 'block';
  els.loginBtn.style.display = 'none';
  els.logoutBtn.style.display = 'inline-flex';
  els.memberName.textContent = state.member.nickname || state.member.display_name || 'LINE 會員';
  els.memberPoints.textContent = String(state.member.current_points ?? 0);
  els.memberAvatar.src = state.member.avatar_url || 'https://placehold.co/96x96?text=User';
}

function renderCampaignList() {
  if (!state.campaigns.length) {
    els.campaignList.innerHTML = '<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.campaignList.innerHTML = state.campaigns.map((item) => `
    <article class="reward-card ${state.currentCampaignId === item.id ? 'selected-card' : ''}">
      <img class="reward-image" src="${escapeHtml(item.cover_image_url || 'https://placehold.co/600x400?text=KUJI')}" alt="${escapeHtml(item.title)}">
      <div class="reward-body">
        <span class="badge">${escapeHtml(item.status)}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description || '暫無活動說明')}</p>
        <div class="reward-meta">
          <span>${escapeHtml(item.points_per_draw)} 點 / 抽</span>
          <span>剩餘 ${escapeHtml(item.remaining_tickets)}</span>
        </div>
        <button class="btn btn-primary open-campaign-btn" type="button" data-id="${item.id}">查看活動</button>
      </div>
    </article>
  `).join('');
  els.campaignList.querySelectorAll('.open-campaign-btn').forEach((btn) => {
    btn.addEventListener('click', () => openCampaign(Number(btn.dataset.id)));
  });
}

function getTurnRemainingSeconds() {
  const expiresAt = state.currentDetail?.turn?.holder_expires_at;
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function stopTimers() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.refreshTimer = null;
  state.countdownTimer = null;
}

function renderTurnStatus() {
  const turn = state.currentDetail?.turn;
  if (!turn) {
    els.turnStatus.textContent = '尚未讀取';
    els.turnStatus.className = 'status-chip idle';
    els.turnCountdown.textContent = '-';
    els.turnCountdown.className = 'status-chip idle';
    return;
  }
  if (turn.my_turn) {
    const remain = getTurnRemainingSeconds();
    els.turnStatus.textContent = '目前輪到你抽籤';
    els.turnStatus.className = 'status-chip mine';
    els.turnCountdown.textContent = remain > 0 ? `剩餘 ${remain} 秒` : '已到期';
    els.turnCountdown.className = 'status-chip mine';
    return;
  }
  if (turn.occupied_by_other) {
    const remain = getTurnRemainingSeconds();
    els.turnStatus.textContent = `目前由 ${turn.holder_nickname || '其他玩家'} 抽籤中`;
    els.turnStatus.className = 'status-chip busy';
    els.turnCountdown.textContent = remain > 0 ? `約 ${remain} 秒後可搶` : '可重新整理';
    els.turnCountdown.className = 'status-chip busy';
    return;
  }
  els.turnStatus.textContent = '目前可開始抽籤';
  els.turnStatus.className = 'status-chip idle';
  els.turnCountdown.textContent = '尚未有人持有回合';
  els.turnCountdown.className = 'status-chip idle';
}

function renderDetail() {
  const detail = state.currentDetail;
  if (!detail) {
    els.detailSection.style.display = 'none';
    return;
  }
  const campaign = detail.campaign;
  els.detailSection.style.display = 'block';
  els.campaignTitle.textContent = campaign.title;
  els.campaignImage.src = campaign.cover_image_url || 'https://placehold.co/1200x600?text=KUJI';
  els.campaignDescription.textContent = campaign.description || '暫無活動說明';
  els.campaignStats.innerHTML = `
    <div class="stat-chip">每抽 ${escapeHtml(campaign.points_per_draw)} 點</div>
    <div class="stat-chip">總籤數 ${escapeHtml(campaign.total_tickets)}</div>
    <div class="stat-chip">剩餘 ${escapeHtml(campaign.remaining_tickets)}</div>
    <div class="stat-chip">單次最多 ${escapeHtml(campaign.max_draw_per_order)} 抽</div>
    <div class="stat-chip">保留 ${escapeHtml(campaign.reserve_seconds)} 秒</div>
  `;
  els.drawCountInput.max = String(campaign.max_draw_per_order || 1);
  if (Number(els.drawCountInput.value || 1) > Number(campaign.max_draw_per_order || 1)) {
    els.drawCountInput.value = String(campaign.max_draw_per_order || 1);
  }
  els.prizeList.innerHTML = (detail.prizes || []).map((prize) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(prize.prize_code)}賞・${escapeHtml(prize.prize_name)}</div>
        <div class="list-subtitle">總數 ${escapeHtml(prize.total_quantity)}</div>
      </div>
      <div class="list-points">剩餘 ${escapeHtml(prize.remaining_quantity)}</div>
    </div>
  `).join('') || '<div class="empty-state">尚未設定獎項</div>';

  const myResults = detail.my_results || [];
  els.resultList.innerHTML = myResults.length
    ? myResults.map((row) => `
      <div class="list-item">
        <div>
          <div class="list-title">${escapeHtml(row.prize_name || '未中獎')}</div>
          <div class="list-subtitle">${new Date(row.created_at).toLocaleString('zh-TW')}</div>
        </div>
        <div class="list-points">-${escapeHtml(row.points_spent)} 點</div>
      </div>
    `).join('')
    : '<div class="empty-state">你還沒有抽過這個活動</div>';

  renderTurnStatus();
  const myTurn = !!detail.turn?.my_turn;
  els.drawBtn.disabled = !myTurn;
  els.releaseTurnBtn.disabled = !myTurn;
  els.claimTurnBtn.disabled = myTurn || !!detail.turn?.occupied_by_other;
}

function setupTimers() {
  stopTimers();
  if (!state.currentCampaignId) return;
  state.refreshTimer = setInterval(() => {
    if (state.currentCampaignId) refreshCurrentCampaign(true);
  }, 5000);
  state.countdownTimer = setInterval(() => {
    renderTurnStatus();
  }, 1000);
}

async function loadDashboard() {
  if (!state.accessToken) return;
  const data = await callApi('login');
  state.member = data.member || null;
  renderMemberSection();
}

async function loadCampaigns() {
  const data = await callApi('get_kuji_campaigns');
  state.campaigns = data.campaigns || [];
  renderCampaignList();
  if (!state.currentCampaignId && state.campaigns.length) {
    state.currentCampaignId = state.campaigns[0].id;
  }
}

async function openCampaign(campaignId) {
  state.currentCampaignId = campaignId;
  const url = new URL(window.location.href);
  url.searchParams.set('campaignId', campaignId);
  window.history.replaceState({}, document.title, url.toString());
  await refreshCurrentCampaign(false);
}

async function refreshCurrentCampaign(silent = false) {
  if (!state.currentCampaignId) return;
  const data = await callApi('get_kuji_campaign_detail', { campaignId: state.currentCampaignId });
  state.currentDetail = data;
  renderDetail();
  if (!silent) clearMessage();
}

async function claimTurn() {
  const key = 'claimTurn';
  try {
    startPending(key);
    setButtonLoading(els.claimTurnBtn, true);
    const data = await callApi('claim_kuji_turn', { campaignId: state.currentCampaignId });
    showMessage(data.message || '已取得抽籤回合');
    await Promise.all([loadCampaigns(), refreshCurrentCampaign(true)]);
    setupTimers();
  } catch (error) {
    showMessage(normalizeError(error, '取得回合失敗'), true);
    await refreshCurrentCampaign(true);
  } finally {
    endPending(key);
    setButtonLoading(els.claimTurnBtn, false);
  }
}

async function releaseTurn() {
  const key = 'releaseTurn';
  try {
    startPending(key);
    setButtonLoading(els.releaseTurnBtn, true);
    const data = await callApi('release_kuji_turn', { campaignId: state.currentCampaignId });
    showMessage(data.message || '已釋放抽籤回合');
    await Promise.all([loadCampaigns(), refreshCurrentCampaign(true)]);
  } catch (error) {
    showMessage(normalizeError(error, '釋放回合失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(els.releaseTurnBtn, false);
  }
}

async function drawKuji() {
  const key = 'drawKuji';
  try {
    startPending(key);
    setButtonLoading(els.drawBtn, true, '抽籤中...');
    const drawCount = Number(els.drawCountInput.value || 1);
    const data = await callApi('draw_kuji_with_points', {
      campaignId: state.currentCampaignId,
      drawCount,
      requestId: makeRequestId('kuji-draw'),
    });
    showMessage(data.message || '抽籤成功');
    await loadDashboard();
    await Promise.all([loadCampaigns(), refreshCurrentCampaign(true)]);
  } catch (error) {
    showMessage(normalizeError(error, '抽籤失敗'), true);
    await refreshCurrentCampaign(true);
  } finally {
    endPending(key);
    setButtonLoading(els.drawBtn, false);
  }
}

async function bootstrap() {
  try {
    const config = getConfig();
    if (!config.liffId || !config.supabaseUrl || !config.supabaseAnonKey || !config.apiFunctionName) {
      throw new Error('請先設定 config.js');
    }
    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: false });
    if (!liff.isLoggedIn()) {
      renderMemberSection();
      await loadCampaigns();
      if (state.currentCampaignId) await refreshCurrentCampaign(true);
      setupTimers();
      return;
    }
    state.accessToken = liff.getAccessToken();
    await loadDashboard();
    await loadCampaigns();
    if (state.currentCampaignId) await refreshCurrentCampaign(true);
    setupTimers();
  } catch (error) {
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

function signIn() {
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return;
  }
  bootstrap();
}
function signOut() {
  stopTimers();
  if (liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.member = null;
  renderMemberSection();
  showMessage('已登出');
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.refreshCampaignsBtn?.addEventListener('click', async () => { await loadCampaigns(); if (state.currentCampaignId) await refreshCurrentCampaign(true); showMessage('已更新活動列表'); });
els.claimTurnBtn?.addEventListener('click', claimTurn);
els.releaseTurnBtn?.addEventListener('click', releaseTurn);
els.drawBtn?.addEventListener('click', drawKuji);
els.refreshDetailBtn?.addEventListener('click', async () => { await refreshCurrentCampaign(); showMessage('活動狀態已更新'); });
window.addEventListener('pagehide', stopTimers);
bootstrap();
