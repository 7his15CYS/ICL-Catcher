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
  memberRoleBadge: document.getElementById('member-role-badge'),

  ichibanSection: document.getElementById('ichiban-section'),

  nicknameInput: document.getElementById('nickname-input'),
  nicknameSaveBtn: document.getElementById('nickname-save-btn'),

  rewardsList: document.getElementById('rewards-list'),
  redemptionList: document.getElementById('redemption-list'),
  leaderboardList: document.getElementById('leaderboard-list'),
  ichibanSummary: document.getElementById('ichiban-summary'),

  adminSection: document.getElementById('admin-section'),
  adminSearchInput: document.getElementById('admin-search-input'),
  adminSearchBtn: document.getElementById('admin-search-btn'),
  adminSearchResults: document.getElementById('admin-search-results'),

  grantPointsMemberId: document.getElementById('grant-points-member-id'),
  grantPointsValue: document.getElementById('grant-points-value'),
  grantPointsReason: document.getElementById('grant-points-reason'),
  grantPointsBtn: document.getElementById('grant-points-btn'),

  deductPointsMemberId: document.getElementById('deduct-points-member-id'),
  deductPointsValue: document.getElementById('deduct-points-value'),
  deductPointsReason: document.getElementById('deduct-points-reason'),
  deductPointsBtn: document.getElementById('deduct-points-btn'),

  ichibanEventId: document.getElementById('ichiban-event-id'),
  ichibanTitle: document.getElementById('ichiban-title'),
  ichibanPointCost: document.getElementById('ichiban-point-cost'),
  ichibanTotalTickets: document.getElementById('ichiban-total-tickets'),
  ichibanDescription: document.getElementById('ichiban-description'),
  ichibanCoverImage: document.getElementById('ichiban-cover-image'),
  ichibanLockSeconds: document.getElementById('ichiban-lock-seconds'),
  saveIchibanEventBtn: document.getElementById('save-ichiban-event-btn'),
  loadIchibanEventsBtn: document.getElementById('load-ichiban-events-btn'),
  adminIchibanEvents: document.getElementById('admin-ichiban-events'),

  ichibanPrizeEventId: document.getElementById('ichiban-prize-event-id'),
  ichibanPrizeName: document.getElementById('ichiban-prize-name'),
  ichibanPrizeCount: document.getElementById('ichiban-prize-count'),
  ichibanPrizeSort: document.getElementById('ichiban-prize-sort'),
  ichibanPrizeImage: document.getElementById('ichiban-prize-image'),
  ichibanPrizeDescription: document.getElementById('ichiban-prize-description'),
  saveIchibanPrizeBtn: document.getElementById('save-ichiban-prize-btn'),

  ichibanGenerateEventId: document.getElementById('ichiban-generate-event-id'),
  generateIchibanTicketsBtn: document.getElementById('generate-ichiban-tickets-btn'),
  releaseIchibanLockBtn: document.getElementById('release-ichiban-lock-btn'),
  adminIchibanPrizes: document.getElementById('admin-ichiban-prizes'),
};

const state = {
  accessToken: null,
  profile: null,
  dashboard: null,
  pending: new Set(),
  ichibanEvents: [],
};

function getConfig() {
  return window.APP_CONFIG || {};
}

function normalizeError(err, fallback = '發生錯誤') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err === '[object Object]' ? fallback : err;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object') {
    if (typeof err.message === 'string' && err.message) return err.message;
    if (typeof err.error_description === 'string') return err.error_description;
    if (typeof err.error === 'string') return err.error;
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return fallback;
    }
  }
  return String(err);
}

function showMessage(message, isError = false) {
  const text = typeof message === 'string' ? message : normalizeError(message);
  if (!els.messageBox) return;
  if (!text) {
    els.messageBox.style.display = 'none';
    els.messageBox.textContent = '';
    return;
  }
  els.messageBox.textContent = text;
  els.messageBox.style.display = 'block';
  els.messageBox.className = isError ? 'message error' : 'message success';
}
function clearMessage() { showMessage(''); }

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCleanAppUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function hasLiffRedirectParams() {
  const url = new URL(window.location.href);
  return url.searchParams.has('code') || url.searchParams.has('state') || url.searchParams.has('liffClientId') || url.searchParams.has('liffRedirectUri');
}

function makeRequestId(prefix) {
  return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`;
}

function setButtonLoading(button, isLoading, loadingText = '處理中...') {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent || '';
  button.disabled = isLoading;
  button.classList.toggle('is-loading', isLoading);
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}

function startPending(key) {
  if (state.pending.has(key)) throw new Error('上一個操作尚未完成，請稍候');
  state.pending.add(key);
}
function endPending(key) { state.pending.delete(key); }

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
  state.dashboard = null;
  state.ichibanEvents = [];

  if (els.authSection) els.authSection.style.display = 'block';
  if (els.memberSection) els.memberSection.style.display = 'none';
  if (els.adminSection) els.adminSection.style.display = 'none';
  if (els.ichibanSection) els.ichibanSection.style.display = 'none';
  if (els.logoutBtn) els.logoutBtn.style.display = 'none';
  if (els.loginBtn) els.loginBtn.style.display = 'inline-flex';
  if (els.rewardsList) els.rewardsList.innerHTML = '<div class="empty-state">登入後可查看可兌換商品</div>';
  if (els.redemptionList) els.redemptionList.innerHTML = '<div class="empty-state">登入後可查看兌換紀錄</div>';
  if (els.ichibanSummary) els.ichibanSummary.innerHTML = '';
}

function renderRewards(rewards = []) {
  if (!els.rewardsList) return;
  if (!rewards.length) {
    els.rewardsList.innerHTML = '<div class="empty-state">目前沒有可兌換獎品</div>';
    return;
  }
  const loggedIn = !!state.dashboard?.member?.id;
  els.rewardsList.innerHTML = rewards.slice(0, 3).map((reward) => {
    const stockEmpty = Number(reward.stock ?? 0) <= 0;
    const disabled = !loggedIn || stockEmpty ? 'disabled' : '';
    const imageUrl = reward.image_url || 'https://placehold.co/600x400?text=Reward';
    return `
      <div class="reward-card">
        <img class="reward-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(reward.name)}">
        <div class="reward-body">
          <span class="reward-category">${escapeHtml(reward.category || '未分類')}</span>
          <h3>${escapeHtml(reward.name)}</h3>
          <p>${escapeHtml(reward.description || '')}</p>
          <div class="reward-meta"><span>${escapeHtml(reward.points_cost)} 點</span><span>庫存 ${escapeHtml(reward.stock)}</span></div>
          <button class="btn btn-primary redeem-btn" type="button" data-reward-id="${escapeHtml(reward.id)}" ${disabled}>${!loggedIn ? '登入後兌換' : stockEmpty ? '已無庫存' : '兌換'}</button>
        </div>
      </div>`;
  }).join('');

  els.rewardsList.querySelectorAll('.redeem-btn').forEach((btn) => {
    btn.addEventListener('click', async () => redeemReward(Number(btn.dataset.rewardId), btn));
  });
}

function renderRedemptions(redemptions = []) {
  if (!els.redemptionList) return;
  if (!redemptions.length) {
    els.redemptionList.innerHTML = '<div class="empty-state">尚無兌換紀錄</div>';
    return;
  }
  els.redemptionList.innerHTML = redemptions.map((item) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(item.reward_name)}</div>
        <div class="list-subtitle">${new Date(item.created_at).toLocaleString('zh-TW')} ・ ${escapeHtml(item.status)}</div>
      </div>
      <div class="list-points">-${escapeHtml(item.points_spent)} 點</div>
    </div>`).join('');
}

function renderLeaderboard(list = []) {
  if (!els.leaderboardList) return;
  if (!list.length) {
    els.leaderboardList.innerHTML = '<div class="empty-state">目前沒有排行榜資料</div>';
    return;
  }
  els.leaderboardList.innerHTML = list.map((item, index) => `
    <div class="list-item">
      <div class="leaderboard-user">
        <div class="leaderboard-rank">#${index + 1}</div>
        <img class="leaderboard-avatar" src="${escapeHtml(item.avatar_url || 'https://placehold.co/64x64?text=U')}" alt="${escapeHtml(item.display_name)}">
        <div><div class="list-title">${escapeHtml(item.display_name)}</div></div>
      </div>
      <div class="list-points">${escapeHtml(item.points)} 點</div>
    </div>`).join('');
}

function renderIchibanSummary(events = []) {
  if (!els.ichibanSummary) return;
  if (!events.length) {
    els.ichibanSummary.innerHTML = '<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.ichibanSummary.innerHTML = events.map((event) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(event.title)}</div>
        <div class="list-subtitle">${escapeHtml(event.point_cost)} 點 / 抽 ・ 剩餘 ${escapeHtml(event.remaining_tickets)} / ${escapeHtml(event.total_tickets)} 張</div>
      </div>
      <a class="btn btn-primary" href="./ichiban.html?eventId=${encodeURIComponent(event.id)}">立即抽獎</a>
    </div>`).join('');
}

function renderAdminSearchResults(members = []) {
  if (!els.adminSearchResults) return;
  if (!members.length) {
    els.adminSearchResults.innerHTML = '<div class="empty-state">找不到符合條件的會員</div>';
    return;
  }
  els.adminSearchResults.innerHTML = members.map((member) => {
    const roleLabel = member.member_role === 'vip' ? 'VIP' : '一般會員';
    return `
    <div class="list-item list-item-stack">
      <div class="leaderboard-user">
        <img class="leaderboard-avatar" src="${escapeHtml(member.avatar_url || 'https://placehold.co/64x64?text=U')}" alt="${escapeHtml(member.nickname || member.display_name)}">
        <div>
          <div class="list-title">${escapeHtml(member.nickname || member.display_name)}</div>
          <div class="list-subtitle">ID：${escapeHtml(member.id)} ・ 目前 ${escapeHtml(member.current_points ?? 0)} 點 ・ 身分：${escapeHtml(roleLabel)}</div>
        </div>
      </div>
      <div class="admin-chip-row">
        <button class="btn btn-secondary select-member-btn" type="button" data-member-id="${escapeHtml(member.id)}">選取</button>
        <button class="btn btn-secondary set-role-btn" type="button" data-member-id="${escapeHtml(member.id)}" data-role="regular">設成一般客人</button>
        <button class="btn btn-primary set-role-btn" type="button" data-member-id="${escapeHtml(member.id)}" data-role="vip">設成 VIP</button>
      </div>
    </div>`;
  }).join('');

  els.adminSearchResults.querySelectorAll('.select-member-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const memberId = btn.dataset.memberId || '';
      if (els.grantPointsMemberId) els.grantPointsMemberId.value = memberId;
      if (els.deductPointsMemberId) els.deductPointsMemberId.value = memberId;
      showMessage('已帶入會員 ID');
    });
  });

  els.adminSearchResults.querySelectorAll('.set-role-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await updateMemberRole(btn.dataset.memberId || '', btn.dataset.role || 'regular', btn);
    });
  });
}

function renderAdminIchibanEvents() {
  if (!els.adminIchibanEvents) return;
  if (!state.ichibanEvents.length) {
    els.adminIchibanEvents.innerHTML = '<div class="empty-state">尚未建立一番賞活動</div>';
    return;
  }
  els.adminIchibanEvents.innerHTML = state.ichibanEvents.map((event) => `
    <div class="list-item list-item-stack">
      <div>
        <div class="list-title">${escapeHtml(event.title)}</div>
        <div class="list-subtitle">ID：${escapeHtml(event.id)} ・ ${escapeHtml(event.point_cost)} 點 / 抽 ・ 剩餘 ${escapeHtml(event.remaining_tickets)} / ${escapeHtml(event.total_tickets)} 張</div>
      </div>
      <div class="admin-chip-row">
        <button class="btn btn-secondary admin-fill-event-btn" type="button" data-event-id="${escapeHtml(event.id)}">帶入活動</button>
        <a class="btn btn-primary" href="./ichiban.html?eventId=${encodeURIComponent(event.id)}">前往活動</a>
      </div>
    </div>`).join('');

  els.adminIchibanEvents.querySelectorAll('.admin-fill-event-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const event = state.ichibanEvents.find((item) => item.id === btn.dataset.eventId);
      if (!event) return;
      els.ichibanEventId.value = event.id;
      els.ichibanTitle.value = event.title || '';
      els.ichibanPointCost.value = String(event.point_cost || '');
      els.ichibanTotalTickets.value = String(event.total_tickets || '');
      els.ichibanDescription.value = event.description || '';
      els.ichibanCoverImage.value = event.cover_image_url || '';
      els.ichibanLockSeconds.value = String(event.lock_seconds || 90);
      els.ichibanPrizeEventId.value = event.id;
      els.ichibanGenerateEventId.value = event.id;
      renderAdminIchibanPrizes(event.prizes || []);
      showMessage('已帶入一番賞活動資料');
    });
  });
}

function renderAdminIchibanPrizes(prizes = []) {
  if (!els.adminIchibanPrizes) return;
  if (!prizes.length) {
    els.adminIchibanPrizes.innerHTML = '<div class="empty-state">這個活動尚未設定獎項</div>';
    return;
  }
  els.adminIchibanPrizes.innerHTML = prizes.map((prize) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(prize.name)}</div>
        <div class="list-subtitle">數量 ${escapeHtml(prize.quantity)} 張 ・ 排序 ${escapeHtml(prize.sort_order)}</div>
      </div>
    </div>`).join('');
}

function renderDashboard(data) {
  state.dashboard = data;

  const member = data.member || {};
  const isVip = member.member_role === 'vip';
  state.ichibanEvents = isVip ? (data.ichiban_events || []) : [];

  if (els.authSection) els.authSection.style.display = 'none';
  if (els.memberSection) els.memberSection.style.display = 'block';
  if (els.logoutBtn) els.logoutBtn.style.display = 'inline-flex';
  if (els.loginBtn) els.loginBtn.style.display = 'none';
  if (els.ichibanSection) els.ichibanSection.style.display = isVip ? 'block' : 'none';

  if (els.memberName) els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  if (els.memberPoints) els.memberPoints.textContent = String(data.points ?? 0);
  if (els.memberAvatar) els.memberAvatar.src = member.avatar_url || 'https://placehold.co/96x96?text=User';
  if (els.nicknameInput) els.nicknameInput.value = member.nickname || member.display_name || '';
  if (els.memberRoleBadge) {
    els.memberRoleBadge.textContent = isVip ? 'VIP 會員' : '一般會員';
    els.memberRoleBadge.classList.toggle('vip', isVip);
  }

  renderRewards(data.rewards || []);
  renderRedemptions(data.redemptions || []);
  renderLeaderboard(data.leaderboard || []);
  if (isVip) {
    renderIchibanSummary(data.ichiban_events || []);
  } else if (els.ichibanSummary) {
    els.ichibanSummary.innerHTML = '';
  }
  renderAdminIchibanEvents();

  if (els.adminSection) {
    els.adminSection.style.display = data.member?.is_admin ? 'block' : 'none';
  }
}

async function bootstrapDashboard() {
  const data = await callApi('login');
  renderDashboard(data);
}

async function saveNickname() {
  const key = 'saveNickname';
  try {
    startPending(key); setButtonLoading(els.nicknameSaveBtn, true, '更新中...'); clearMessage();
    const nickname = els.nicknameInput?.value?.trim();
    if (!nickname) throw new Error('請輸入暱稱');
    const result = await callApi('update_nickname', { nickname });
    showMessage(result.message || '暱稱更新成功');
    renderDashboard(result);
  } catch (error) {
    showMessage(normalizeError(error, '暱稱更新失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.nicknameSaveBtn, false);
  }
}

async function redeemReward(rewardId, button) {
  const key = `redeem:${rewardId}`;
  try {
    startPending(key); setButtonLoading(button, true, '兌換中...'); clearMessage();
    if (!state.dashboard?.member?.id) throw new Error('尚未取得會員資料');
    await callApi('redeem', { memberId: state.dashboard.member.id, rewardId, requestId: makeRequestId('redeem') });
    showMessage('兌換成功');
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '兌換失敗'), true);
  } finally {
    endPending(key); setButtonLoading(button, false);
  }
}

async function searchMembers() {
  const key = 'searchMembers';
  try {
    startPending(key); setButtonLoading(els.adminSearchBtn, true, '搜尋中...'); clearMessage();
    const data = await callApi('search_members', { keyword: els.adminSearchInput?.value?.trim() || '' });
    renderAdminSearchResults(data.members || []);
  } catch (error) {
    showMessage(normalizeError(error, '搜尋會員失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.adminSearchBtn, false);
  }
}

async function updateMemberRole(memberId, memberRole, button) {
  const key = `updateMemberRole:${memberId}`;
  try {
    startPending(key); setButtonLoading(button, true, '更新中...'); clearMessage();
    const result = await callApi('admin_update_member_role', { memberId, memberRole });
    showMessage(result.message || '會員身分已更新');
    if (state.dashboard?.member?.id === memberId) await bootstrapDashboard();
    await searchMembers();
  } catch (error) {
    showMessage(normalizeError(error, '更新會員身分失敗'), true);
  } finally {
    endPending(key); setButtonLoading(button, false);
  }
}

async function grantPoints() {
  const key = 'grantPoints';
  try {
    startPending(key); setButtonLoading(els.grantPointsBtn, true, '加點中...'); clearMessage();
    const result = await callApi('grant_points', {
      memberId: els.grantPointsMemberId.value.trim(),
      points: Number(els.grantPointsValue.value || 0),
      reason: els.grantPointsReason.value.trim(),
      requestId: makeRequestId('grant'),
    });
    showMessage(result.message || '加點成功');
    els.grantPointsValue.value = '';
    els.grantPointsReason.value = '';
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '加點失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.grantPointsBtn, false);
  }
}

async function deductPoints() {
  const key = 'deductPoints';
  try {
    startPending(key); setButtonLoading(els.deductPointsBtn, true, '扣點中...'); clearMessage();
    const result = await callApi('deduct_points', {
      memberId: els.deductPointsMemberId.value.trim(),
      points: Number(els.deductPointsValue.value || 0),
      reason: els.deductPointsReason.value.trim(),
      requestId: makeRequestId('deduct'),
    });
    showMessage(result.message || '扣點成功');
    els.deductPointsValue.value = '';
    els.deductPointsReason.value = '';
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '扣點失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.deductPointsBtn, false);
  }
}

async function saveIchibanEvent() {
  const key = 'saveIchibanEvent';
  try {
    startPending(key); setButtonLoading(els.saveIchibanEventBtn, true, '儲存中...'); clearMessage();
    const result = await callApi('admin_upsert_ichiban_event', {
      eventId: els.ichibanEventId.value.trim() || null,
      title: els.ichibanTitle.value.trim(),
      description: els.ichibanDescription.value.trim(),
      coverImageUrl: els.ichibanCoverImage.value.trim(),
      pointCost: Number(els.ichibanPointCost.value || 0),
      totalTickets: Number(els.ichibanTotalTickets.value || 0),
      lockSeconds: Number(els.ichibanLockSeconds.value || 90),
    });
    showMessage(result.message || '活動已儲存');
    if (result.event?.id) {
      els.ichibanEventId.value = result.event.id;
      els.ichibanPrizeEventId.value = result.event.id;
      els.ichibanGenerateEventId.value = result.event.id;
    }
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '儲存活動失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.saveIchibanEventBtn, false);
  }
}

async function saveIchibanPrize() {
  const key = 'saveIchibanPrize';
  try {
    startPending(key); setButtonLoading(els.saveIchibanPrizeBtn, true, '新增中...'); clearMessage();
    const result = await callApi('admin_add_ichiban_prize', {
      eventId: els.ichibanPrizeEventId.value.trim(),
      name: els.ichibanPrizeName.value.trim(),
      description: els.ichibanPrizeDescription.value.trim(),
      imageUrl: els.ichibanPrizeImage.value.trim(),
      quantity: Number(els.ichibanPrizeCount.value || 0),
      sortOrder: Number(els.ichibanPrizeSort.value || 1),
    });
    showMessage(result.message || '獎項已新增');
    els.ichibanPrizeName.value = '';
    els.ichibanPrizeDescription.value = '';
    els.ichibanPrizeImage.value = '';
    els.ichibanPrizeCount.value = '';
    els.ichibanPrizeSort.value = '';
    renderAdminIchibanPrizes(result.prizes || []);
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '新增獎項失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.saveIchibanPrizeBtn, false);
  }
}

async function generateIchibanTickets() {
  const key = 'generateIchibanTickets';
  try {
    startPending(key); setButtonLoading(els.generateIchibanTicketsBtn, true, '產生中...'); clearMessage();
    const result = await callApi('admin_generate_ichiban_tickets', { eventId: els.ichibanGenerateEventId.value.trim() });
    showMessage(result.message || '籤池已重建');
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '產生籤池失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.generateIchibanTicketsBtn, false);
  }
}

async function releaseIchibanLock() {
  const key = 'releaseIchibanLock';
  try {
    startPending(key); setButtonLoading(els.releaseIchibanLockBtn, true, '解除中...'); clearMessage();
    const result = await callApi('admin_release_ichiban_lock', { eventId: els.ichibanGenerateEventId.value.trim() });
    showMessage(result.message || '已解除鎖定');
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '解除鎖定失敗'), true);
  } finally {
    endPending(key); setButtonLoading(els.releaseIchibanLockBtn, false);
  }
}

async function signIn() {
  try {
    clearMessage();
    const currentConfig = getConfig();
    if (!currentConfig.liffId) throw new Error('config.js 尚未設定 liffId');
    if (!window.liff) throw new Error('LIFF SDK 尚未載入');
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: getCleanAppUrl() }); return; }
    await bootstrap();
  } catch (error) {
    showMessage(normalizeError(error, 'LINE 登入失敗'), true);
  }
}

async function signOut() {
  try {
    clearMessage();
    if (window.liff && liff.isLoggedIn()) liff.logout();
    state.accessToken = null; state.profile = null; state.dashboard = null; state.pending.clear();
    renderLoggedOut(); showMessage('已登出');
  } catch (error) {
    showMessage(normalizeError(error, '登出失敗'), true);
  }
}

async function bootstrap() {
  clearMessage();
  try {
    const config = getConfig();
    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: true });
    if (liff.isLoggedIn() && hasLiffRedirectParams()) window.history.replaceState({}, document.title, getCleanAppUrl());
    if (!liff.isLoggedIn()) { renderLoggedOut(); return; }
    state.accessToken = liff.getAccessToken();
    state.profile = await liff.getProfile();
    await bootstrapDashboard();
  } catch (error) {
    renderLoggedOut();
    showMessage(`初始化失敗：${normalizeError(error)}`, true);
  } finally {
    if (els.appReady) els.appReady.style.display = 'block';
  }
}

function bindEvents() {
  if (els.loginBtn) els.loginBtn.addEventListener('click', signIn);
  if (els.logoutBtn) els.logoutBtn.addEventListener('click', signOut);
  if (els.nicknameSaveBtn) els.nicknameSaveBtn.addEventListener('click', saveNickname);
  if (els.adminSearchBtn) els.adminSearchBtn.addEventListener('click', searchMembers);
  if (els.grantPointsBtn) els.grantPointsBtn.addEventListener('click', grantPoints);
  if (els.deductPointsBtn) els.deductPointsBtn.addEventListener('click', deductPoints);
  if (els.saveIchibanEventBtn) els.saveIchibanEventBtn.addEventListener('click', saveIchibanEvent);
  if (els.loadIchibanEventsBtn) els.loadIchibanEventsBtn.addEventListener('click', bootstrapDashboard);
  if (els.saveIchibanPrizeBtn) els.saveIchibanPrizeBtn.addEventListener('click', saveIchibanPrize);
  if (els.generateIchibanTicketsBtn) els.generateIchibanTicketsBtn.addEventListener('click', generateIchibanTickets);
  if (els.releaseIchibanLockBtn) els.releaseIchibanLockBtn.addEventListener('click', releaseIchibanLock);
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  renderLoggedOut();
  await bootstrap();
});
