const els = {
  authSection: document.getElementById('auth-section'),
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  messageBox: document.getElementById('message-box'),
  memberSection: document.getElementById('member-section'),
  memberName: document.getElementById('member-name'),
  memberAvatar: document.getElementById('member-avatar'),
  memberPoints: document.getElementById('member-points'),
  memberRoleBadge: document.getElementById('member-role-badge'),
  nicknameInput: document.getElementById('nickname-input'),
  nicknameSaveBtn: document.getElementById('nickname-save-btn'),
  rewardsList: document.getElementById('rewards-list'),
  redemptionList: document.getElementById('redemption-list'),
  leaderboardList: document.getElementById('leaderboard-list'),
  ichibanSection: document.getElementById('ichiban-section'),
  ichibanSummary: document.getElementById('ichiban-summary'),
  adminSection: document.getElementById('admin-section'),
};

const state = { accessToken: null, dashboard: null, pending: new Set(), isRefreshingToken: false };

function getConfig() {
  return window.APP_CONFIG || {};
}

function normalizeError(err, fallback = '發生錯誤') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object') return err.message || err.error || fallback;
  return String(err);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeCategory(value) {
  const category = String(value ?? '').trim();
  return category || '兌換商品';
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

function clearMessage() {
  showMessage('');
}

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

function endPending(key) {
  state.pending.delete(key);
}

function getCleanAppUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function isTokenExpiredError(error) {
  const message = normalizeError(error, '').toLowerCase();
  return (
    message.includes('access token expired') ||
    message.includes('invalid access token') ||
    message.includes('line access token 驗證失敗') ||
    message.includes('line profile 取得失敗') ||
    message.includes('token expired')
  );
}

async function refreshAccessToken(forceRelogin = false) {
  if (!window.liff) throw new Error('LIFF SDK 尚未載入');

  if (state.isRefreshingToken) {
    throw new Error('LINE 登入資訊更新中，請稍後再試');
  }

  state.isRefreshingToken = true;
  try {
    if (forceRelogin && liff.isLoggedIn()) {
      try {
        liff.logout();
      } catch (logoutError) {
        console.warn('LIFF logout failed before relogin:', logoutError);
      }
    }

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: getCleanAppUrl() });
      throw new Error('LINE 登入已失效，正在重新登入');
    }

    const accessToken = liff.getAccessToken();
    if (!accessToken) {
      liff.login({ redirectUri: getCleanAppUrl() });
      throw new Error('無法取得新的 LINE access token，正在重新登入');
    }

    state.accessToken = accessToken;
    return accessToken;
  } finally {
    state.isRefreshingToken = false;
  }
}

function hasLiffRedirectParams() {
  const url = new URL(window.location.href);
  return url.searchParams.has('code') || url.searchParams.has('state') || url.searchParams.has('liffClientId') || url.searchParams.has('liffRedirectUri');
}

async function callApi(action, payload = {}, options = {}) {
  const config = getConfig();
  const { retryOnExpiredToken = true } = options;

  const res = await fetch(`${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey },
    body: JSON.stringify({ action, accessToken: state.accessToken, ...payload }),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!res.ok || data.ok === false) {
    if (retryOnExpiredToken && isTokenExpiredError(data)) {
      await refreshAccessToken(true);
      return await callApi(action, payload, { retryOnExpiredToken: false });
    }
    throw data;
  }
  return data;
}

function toSafeNumber(value, fallback = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}


function getMemberBadgeHtml(member) {
  const normalizedRole = String(member?.member_role || '').toLowerCase();
  if (member?.is_admin) {
    return {
      access: true,
      className: 'member-role-badge admin',
      html: `
        <span class="role-icon" aria-hidden="true">🛡</span>
        <span class="role-text">管理員</span>
      `,
    };
  }

  if (normalizedRole === 'vip') {
    return {
      access: true,
      className: 'member-role-badge vip',
      html: `
        <span class="vip-star" aria-hidden="true">★</span>
        <span class="vip-text">VIP 會員</span>
      `,
    };
  }

  return {
    access: false,
    className: 'member-role-badge',
    html: '<span class="role-text">一般會員</span>',
  };
}

function getFeaturedRewards(rewards = []) {
  const featured = rewards
    .filter((reward) => reward?.is_featured === true)
    .sort((a, b) => {
      const orderDiff = toSafeNumber(a.featured_order) - toSafeNumber(b.featured_order);
      if (orderDiff !== 0) return orderDiff;
      const pointsDiff = toSafeNumber(a.points_cost, 0) - toSafeNumber(b.points_cost, 0);
      if (pointsDiff !== 0) return pointsDiff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
    })
    .slice(0, 3);

  if (featured.length > 0) {
    return featured;
  }

  return [...rewards]
    .sort((a, b) => {
      const pointsDiff = toSafeNumber(a.points_cost, 0) - toSafeNumber(b.points_cost, 0);
      if (pointsDiff !== 0) return pointsDiff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
    })
    .slice(0, 3);
}

function renderRewards(rewards) {
  const featuredRewards = getFeaturedRewards(rewards);

  if (!featuredRewards.length) {
    els.rewardsList.innerHTML = '<div class="empty-state">目前沒有可顯示的精選獎品</div>';
    return;
  }

  els.rewardsList.innerHTML = featuredRewards.map((reward) => `
    <article class="reward-card">
      <img class="reward-image" src="${escapeHtml(reward.image_url || 'https://placehold.co/600x400?text=Reward')}" alt="${escapeHtml(reward.name)}">
      <div class="reward-body">
        <span class="reward-category">${escapeHtml(normalizeCategory(reward.category))}</span>
        <h3>${escapeHtml(reward.name)}</h3>
        <p>${escapeHtml(reward.description || '暫無說明')}</p>
        <div class="reward-meta"><span>${escapeHtml(reward.points_cost)} 點</span><span>庫存 ${escapeHtml(reward.stock)}</span></div>
        <a class="btn btn-secondary" href="./shop.html">前往兌換</a>
      </div>
    </article>`).join('');
}

function renderRedemptions(redemptions) {
  if (!redemptions.length) {
    els.redemptionList.innerHTML = '<div class="empty-state">你還沒有兌換紀錄</div>';
    return;
  }
  els.redemptionList.innerHTML = redemptions.map((item) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(item.reward_name)}</div>
        <div class="list-subtitle">${new Date(item.created_at).toLocaleString('zh-TW')} ・ 狀態：${escapeHtml(item.status)}</div>
      </div>
      <div class="list-points">-${escapeHtml(item.points_spent)} 點</div>
    </div>`).join('');
}

function renderLeaderboard(list) {
  if (!list.length) {
    els.leaderboardList.innerHTML = '<div class="empty-state">目前沒有排行榜資料</div>';
    return;
  }
  els.leaderboardList.innerHTML = list.map((item, index) => `
    <div class="list-item leaderboard-item">
      <div class="leaderboard-left">
        <div class="leaderboard-rank">#${index + 1}</div>
        <img class="leaderboard-avatar" src="${escapeHtml(item.avatar_url || 'https://placehold.co/64x64?text=U')}" alt="${escapeHtml(item.display_name)}">
        <div class="list-title">${escapeHtml(item.display_name)}</div>
      </div>
      <div class="list-points">${escapeHtml(item.points)} 點</div>
    </div>`).join('');
}

function renderIchibanSummary(events) {
  if (!events.length) {
    els.ichibanSummary.innerHTML = '<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.ichibanSummary.innerHTML = events.map((event) => `
    <div class="list-item list-item-stack">
      <div>
        <div class="list-title">${escapeHtml(event.title)}</div>
        <div class="list-subtitle">${escapeHtml(event.points_per_draw ?? event.point_cost)} 點 / 抽 ・ 剩餘 ${escapeHtml(event.remaining_tickets)} / ${escapeHtml(event.total_tickets)} 張</div>
      </div>
      <a class="btn btn-primary" href="./kuji.html?campaignId=${encodeURIComponent(event.id)}">進入活動</a>
    </div>`).join('');
}

function renderDashboard(data) {
  state.dashboard = data;
  const member = data.member || {};
  const badge = getMemberBadgeHtml(member);
  const canAccessIchiban = badge.access;

  els.authSection.style.display = 'none';
  els.memberSection.style.display = 'block';
  els.logoutBtn.style.display = 'inline-flex';
  els.loginBtn.style.display = 'none';
  els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  els.memberPoints.textContent = String(data.points ?? 0);
  els.memberAvatar.src = member.avatar_url || 'https://placehold.co/96x96?text=User';
  els.nicknameInput.value = member.nickname || member.display_name || '';
  els.memberRoleBadge.style.display = 'inline-flex';
  els.memberRoleBadge.className = badge.className;
  els.memberRoleBadge.innerHTML = badge.html;

  els.ichibanSection.style.display = canAccessIchiban ? 'block' : 'none';
  els.adminSection.style.display = member.is_admin ? 'block' : 'none';

  renderRewards(data.rewards || []);
  renderRedemptions(data.redemptions || []);
  renderLeaderboard(data.leaderboard || []);

  if (canAccessIchiban) {
    renderIchibanSummary(data.ichiban_events || []);
  } else {
    els.ichibanSummary.innerHTML = '';
  }
}

async function saveNickname() {
  const key = 'saveNickname';
  try {
    startPending(key);
    setButtonLoading(els.nicknameSaveBtn, true, '更新中...');
    clearMessage();

    const nickname = els.nicknameInput.value.trim();
    if (!nickname) throw new Error('請輸入暱稱');

    const result = await callApi('update_nickname', { nickname });
    showMessage(result.message || '暱稱更新成功');
    renderDashboard(result);
  } catch (error) {
    showMessage(normalizeError(error, '暱稱更新失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(els.nicknameSaveBtn, false);
  }
}

async function bootstrapDashboard() {
  const data = await callApi('login');
  renderDashboard(data);
}

async function signIn() {
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: getCleanAppUrl() });
    return;
  }
  await bootstrap();
}

function signOut() {
  if (window.liff && liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.dashboard = null;
  state.isRefreshingToken = false;
  els.authSection.style.display = 'block';
  els.memberSection.style.display = 'none';
  els.logoutBtn.style.display = 'none';
  els.loginBtn.style.display = 'inline-flex';
  els.ichibanSection.style.display = 'none';
  els.adminSection.style.display = 'none';
  showMessage('已登出');
}

async function bootstrap() {
  try {
    const config = getConfig();
    if (!config.liffId || !config.supabaseUrl || !config.supabaseAnonKey || !config.apiFunctionName) throw new Error('請先設定 config.js');

    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: false });

    if (!liff.isLoggedIn()) {
      if (hasLiffRedirectParams()) {
        const url = new URL(window.location.href);
        ['code', 'state', 'liffClientId', 'liffRedirectUri'].forEach((k) => url.searchParams.delete(k));
        window.history.replaceState({}, document.title, url.toString());
      }
      return;
    }

    await refreshAccessToken();
    await bootstrapDashboard();
  } catch (error) {
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.nicknameSaveBtn?.addEventListener('click', saveNickname);
bootstrap();
