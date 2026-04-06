const config = window.APP_CONFIG;

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

  nicknameInput: document.getElementById('nickname-input'),
  nicknameSaveBtn: document.getElementById('nickname-save-btn'),

  rewardsList: document.getElementById('rewards-list'),
  redemptionList: document.getElementById('redemption-list'),
  leaderboardList: document.getElementById('leaderboard-list'),

  adminSection: document.getElementById('admin-section'),
  adminSearchInput: document.getElementById('admin-search-input'),
  adminSearchBtn: document.getElementById('admin-search-btn'),
  adminSearchResults: document.getElementById('admin-search-results'),

  grantPointsMemberId: document.getElementById('grant-points-member-id'),
  grantPointsValue: document.getElementById('grant-points-value'),
  grantPointsReason: document.getElementById('grant-points-reason'),
  grantPointsBtn: document.getElementById('grant-points-btn'),
};

const state = {
  accessToken: null,
  profile: null,
  dashboard: null,
};

function normalizeError(err, fallback = '發生錯誤') {
  if (err == null) return fallback;

  if (typeof err === 'string') {
    return err === '[object Object]' ? fallback : err;
  }

  if (err instanceof Error) {
    return err.message && err.message !== '[object Object]'
      ? err.message
      : fallback;
  }

  if (typeof err === 'object') {
    if (err.debug && typeof err.debug === 'object') {
      if (typeof err.debug.message === 'string' && err.debug.message !== '[object Object]') {
        return err.debug.message;
      }
      if (typeof err.debug.error_description === 'string') return err.debug.error_description;
      if (typeof err.debug.error === 'string') return err.debug.error;
      try {
        return JSON.stringify(err.debug, null, 2);
      } catch {}
    }

    if (typeof err.message === 'string' && err.message !== '[object Object]') return err.message;
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
  if (!els.messageBox) return;

  const finalMessage =
    typeof message === 'string'
      ? (message === '[object Object]' ? (isError ? '發生錯誤' : '') : message)
      : normalizeError(message, isError ? '發生錯誤' : '');

  els.messageBox.textContent = finalMessage || '';
  els.messageBox.style.display = finalMessage ? 'block' : 'none';
  els.messageBox.className = isError ? 'message error' : 'message success';
}

function clearMessage() {
  showMessage('');
}

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
  return (
    url.searchParams.has('code') ||
    url.searchParams.has('state') ||
    url.searchParams.has('liffClientId') ||
    url.searchParams.has('liffRedirectUri')
  );
}

async function callApi(action, payload = {}) {
  const url = `${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify({
      action,
      accessToken: state.accessToken,
      ...payload,
    }),
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data.ok === false) {
    throw data;
  }

  return data;
}

function renderLoggedOut() {
  if (els.authSection) els.authSection.style.display = 'block';
  if (els.memberSection) els.memberSection.style.display = 'none';
  if (els.adminSection) els.adminSection.style.display = 'none';
  if (els.logoutBtn) els.logoutBtn.style.display = 'none';
  if (els.loginBtn) els.loginBtn.style.display = 'inline-flex';

  if (els.memberName) els.memberName.textContent = '-';
  if (els.memberPoints) els.memberPoints.textContent = '0';
  if (els.memberAvatar) els.memberAvatar.src = '';
  if (els.rewardsList) els.rewardsList.innerHTML = '';
  if (els.redemptionList) els.redemptionList.innerHTML = '';
  if (els.leaderboardList) els.leaderboardList.innerHTML = '';
  if (els.adminSearchResults) els.adminSearchResults.innerHTML = '';
  if (els.nicknameInput) els.nicknameInput.value = '';
}

function renderRewards(rewards = []) {
  if (!els.rewardsList) return;

  if (!rewards.length) {
    els.rewardsList.innerHTML = `<div class="empty-state">目前沒有可兌換商品</div>`;
    return;
  }

  els.rewardsList.innerHTML = rewards.map((reward) => {
    const disabled = Number(reward.stock ?? 0) <= 0 ? 'disabled' : '';
    const imageUrl = reward.image_url || 'https://placehold.co/600x400?text=Reward';

    return `
      <div class="reward-card">
        <img class="reward-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(reward.name)}">
        <div class="reward-body">
          <h3>${escapeHtml(reward.name)}</h3>
          <p>${escapeHtml(reward.description || '')}</p>
          <div class="reward-meta">
            <span>${escapeHtml(reward.points_cost)} 點</span>
            <span>庫存 ${escapeHtml(reward.stock)}</span>
          </div>
          <button class="btn btn-primary redeem-btn" data-reward-id="${escapeHtml(reward.id)}" ${disabled}>
            ${Number(reward.stock ?? 0) > 0 ? '兌換' : '已無庫存'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  els.rewardsList.querySelectorAll('.redeem-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rewardId = btn.getAttribute('data-reward-id');
      await redeemReward(rewardId);
    });
  });
}

function renderRedemptions(redemptions = []) {
  if (!els.redemptionList) return;

  if (!redemptions.length) {
    els.redemptionList.innerHTML = `<div class="empty-state">目前還沒有兌換紀錄</div>`;
    return;
  }

  els.redemptionList.innerHTML = redemptions.map((item) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(item.reward_name)}</div>
        <div class="list-subtitle">${escapeHtml(item.status)} ・ ${new Date(item.created_at).toLocaleString()}</div>
      </div>
      <div class="list-points">-${escapeHtml(item.points_spent)} 點</div>
    </div>
  `).join('');
}

function renderLeaderboard(leaderboard = []) {
  if (!els.leaderboardList) return;

  if (!leaderboard.length) {
    els.leaderboardList.innerHTML = `<div class="empty-state">目前還沒有排行榜資料</div>`;
    return;
  }

  els.leaderboardList.innerHTML = leaderboard.map((item, index) => `
    <div class="list-item">
      <div class="leaderboard-user">
        <span class="leaderboard-rank">#${index + 1}</span>
        <img class="leaderboard-avatar" src="${escapeHtml(item.avatar_url || 'https://placehold.co/64x64?text=U')}" alt="${escapeHtml(item.display_name)}">
        <div>
          <div class="list-title">${escapeHtml(item.display_name)}</div>
        </div>
      </div>
      <div class="list-points">${escapeHtml(item.points)} 點</div>
    </div>
  `).join('');
}

function renderAdminSearchResults(members = []) {
  if (!els.adminSearchResults) return;

  if (!members.length) {
    els.adminSearchResults.innerHTML = `<div class="empty-state">找不到符合條件的會員</div>`;
    return;
  }

  els.adminSearchResults.innerHTML = members.map((member) => `
    <div class="list-item">
      <div class="leaderboard-user">
        <img class="leaderboard-avatar" src="${escapeHtml(member.avatar_url || 'https://placehold.co/64x64?text=U')}" alt="${escapeHtml(member.nickname || member.display_name)}">
        <div>
          <div class="list-title">${escapeHtml(member.nickname || member.display_name)}</div>
          <div class="list-subtitle">${escapeHtml(member.id)}</div>
        </div>
      </div>
      <button class="btn btn-secondary select-member-btn" data-member-id="${escapeHtml(member.id)}">
        選取
      </button>
    </div>
  `).join('');

  els.adminSearchResults.querySelectorAll('.select-member-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const memberId = btn.getAttribute('data-member-id');
      if (els.grantPointsMemberId) els.grantPointsMemberId.value = memberId || '';
      showMessage('已帶入會員 ID');
    });
  });
}

function renderDashboard(data) {
  state.dashboard = data;

  if (els.authSection) els.authSection.style.display = 'none';
  if (els.memberSection) els.memberSection.style.display = 'block';
  if (els.logoutBtn) els.logoutBtn.style.display = 'inline-flex';
  if (els.loginBtn) els.loginBtn.style.display = 'none';

  const member = data.member || {};
  if (els.memberName) els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  if (els.memberPoints) els.memberPoints.textContent = String(data.points ?? 0);

  if (els.memberAvatar) {
    els.memberAvatar.src =
      member.avatar_url ||
      member.picture_url ||
      'https://placehold.co/96x96?text=User';
    els.memberAvatar.alt = member.nickname || member.display_name || '會員頭像';
  }

  if (els.nicknameInput) {
    els.nicknameInput.value = member.nickname || member.display_name || '';
  }

  renderRewards(data.rewards || []);
  renderRedemptions(data.redemptions || []);
  renderLeaderboard(data.leaderboard || []);

  if (data.member?.is_admin) {
    if (els.adminSection) els.adminSection.style.display = 'block';
  } else {
    if (els.adminSection) els.adminSection.style.display = 'none';
  }
}

async function bootstrapDashboard() {
  const data = await callApi('login');
  renderDashboard(data);
}

async function saveNickname() {
  try {
    clearMessage();

    const nickname = els.nicknameInput?.value?.trim();
    if (!nickname) throw new Error('請輸入暱稱');

    const result = await callApi('update_nickname', { nickname });
    showMessage(result.message || '暱稱更新成功');
    renderDashboard(result);
  } catch (error) {
    console.error('saveNickname error =', error);
    showMessage(normalizeError(error, '暱稱更新失敗'), true);
  }
}

async function redeemReward(rewardId) {
  try {
    clearMessage();
    if (!state.dashboard?.member?.id) throw new Error('尚未取得會員資料');

    await callApi('redeem', {
      memberId: state.dashboard.member.id,
      rewardId,
    });

    showMessage('兌換成功');
    await bootstrapDashboard();
  } catch (error) {
    console.error('redeemReward error =', error);
    showMessage(normalizeError(error, '兌換失敗'), true);
  }
}

async function searchMembers() {
  try {
    clearMessage();
    if (!state.profile?.userId) throw new Error('尚未取得 LINE 使用者資訊');

    const keyword = els.adminSearchInput?.value?.trim() || '';
    const data = await callApi('search_members', {
      keyword,
      adminLineUserId: state.profile.userId,
    });

    renderAdminSearchResults(data.members || []);
  } catch (error) {
    console.error('searchMembers error =', error);
    showMessage(normalizeError(error, '搜尋會員失敗'), true);
  }
}

async function grantPoints() {
  try {
    clearMessage();

    if (!state.profile?.userId) {
      throw new Error('尚未取得 LINE 使用者資訊');
    }

    const memberId = els.grantPointsMemberId?.value?.trim();
    const points = Number(els.grantPointsValue?.value || 0);
    const reason = els.grantPointsReason?.value?.trim();

    if (!memberId) throw new Error('請先填入會員 ID');
    if (!points || points <= 0) throw new Error('請填入大於 0 的點數');
    if (!reason) throw new Error('請填入加點原因');

    const result = await callApi('grant_points', {
      memberId,
      points,
      reason,
      adminLineUserId: state.profile.userId,
    });

    showMessage(result.message || '加點成功');

    if (els.grantPointsValue) els.grantPointsValue.value = '';
    if (els.grantPointsReason) els.grantPointsReason.value = '';

    await bootstrapDashboard();
  } catch (error) {
    console.error('grantPoints error =', error);
    showMessage(normalizeError(error, '加點失敗'), true);
  }
}

async function signIn() {
  try {
    clearMessage();
    if (!window.liff) throw new Error('LIFF SDK 尚未載入');

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: getCleanAppUrl() });
      return;
    }

    await bootstrap();
  } catch (error) {
    console.error('signIn error =', error);
    showMessage(normalizeError(error, 'LINE 登入失敗'), true);
  }
}

async function signOut() {
  try {
    clearMessage();

    if (window.liff && liff.isLoggedIn()) {
      liff.logout();
    }

    state.accessToken = null;
    state.profile = null;
    state.dashboard = null;

    renderLoggedOut();
    showMessage('已登出');
  } catch (error) {
    console.error('signOut error =', error);
    showMessage(normalizeError(error, '登出失敗'), true);
  }
}

async function bootstrap() {
  clearMessage();

  try {
    if (!config?.liffId) throw new Error('config.js 尚未設定 liffId');
    if (!config?.supabaseUrl) throw new Error('config.js 尚未設定 supabaseUrl');
    if (!config?.supabaseAnonKey) throw new Error('config.js 尚未設定 supabaseAnonKey');
    if (!config?.apiFunctionName) throw new Error('config.js 尚未設定 apiFunctionName');
    if (!window.liff) throw new Error('LIFF SDK 尚未載入');

    await liff.init({
      liffId: config.liffId,
      withLoginOnExternalBrowser: true,
    });

    if (liff.isLoggedIn() && hasLiffRedirectParams()) {
      window.history.replaceState({}, document.title, getCleanAppUrl());
    }

    if (!liff.isLoggedIn()) {
      renderLoggedOut();
      return;
    }

    state.accessToken = liff.getAccessToken();
    if (!state.accessToken) throw new Error('無法取得 LINE access token');

    state.profile = await liff.getProfile();
    await bootstrapDashboard();
  } catch (error) {
    console.error('bootstrap error =', error);
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
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  renderLoggedOut();
  await bootstrap();
});
