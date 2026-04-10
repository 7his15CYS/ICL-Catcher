function getConfig() {
  return window.APP_CONFIG || {};
}

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

  shopRewardsList: document.getElementById('shop-rewards-list'),
  shopSectionTitle: document.getElementById('shop-section-title'),
  categoryTabs: document.getElementById('category-tabs'),
};

const state = {
  accessToken: null,
  profile: null,
  dashboard: null,
  allRewards: [],
  selectedCategory: '全部',
  isBootstrapping: false,
  isRefreshingToken: false,
  pending: new Set(),
};

function normalizeError(err, fallback = '發生錯誤') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err === '[object Object]' ? fallback : err;
  if (err instanceof Error) return err.message && err.message !== '[object Object]' ? err.message : fallback;

  if (typeof err === 'object') {
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

function makeRequestId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setButtonLoading(button, isLoading, loadingText = '處理中...') {
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent || '';
  }

  button.disabled = isLoading;
  button.classList.toggle('is-loading', isLoading);
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}

function startPending(key) {
  if (state.pending.has(key)) {
    throw new Error('上一個操作尚未完成，請稍候');
  }
  state.pending.add(key);
}

function endPending(key) {
  state.pending.delete(key);
}

function isTokenExpiredError(error) {
  const message = normalizeError(error, '').toLowerCase();
  return (
    message.includes('access token expired') ||
    message.includes('invalid access token') ||
    message.includes('line access token 驗證失敗') ||
    message.includes('token expired')
  );
}

function resetAuthState() {
  state.accessToken = null;
  state.profile = null;
  state.dashboard = null;
}

async function refreshAccessToken(forceRelogin = false) {
  if (!window.liff) {
    throw new Error('LIFF SDK 尚未載入');
  }

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
      throw new Error('正在重新導向 LINE 登入，請稍候');
    }

    const accessToken = liff.getAccessToken();
    if (!accessToken) {
      liff.login({ redirectUri: getCleanAppUrl() });
      throw new Error('LINE 登入已失效，正在重新登入');
    }

    state.accessToken = accessToken;

    try {
      state.profile = await liff.getProfile();
    } catch (profileError) {
      console.warn('LIFF getProfile failed while refreshing token:', profileError);
    }

    return accessToken;
  } finally {
    state.isRefreshingToken = false;
  }
}

async function callApi(action, payload = {}, options = {}) {
  const config = getConfig();

  if (!config.supabaseUrl) throw new Error('config.js 尚未設定 supabaseUrl');
  if (!config.supabaseAnonKey) throw new Error('config.js 尚未設定 supabaseAnonKey');
  if (!config.apiFunctionName) throw new Error('config.js 尚未設定 apiFunctionName');

  const {
    retryOnExpiredToken = true,
  } = options;

  const url = `${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`;

  const requestBody = {
    action,
    accessToken: state.accessToken,
    ...payload,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify(requestBody),
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
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

function renderLoggedOut() {
  if (els.authSection) els.authSection.style.display = 'block';
  if (els.memberSection) els.memberSection.style.display = 'none';
  if (els.logoutBtn) els.logoutBtn.style.display = 'none';
  if (els.loginBtn) els.loginBtn.style.display = 'inline-flex';
}

function renderMember(data) {
  const member = data.member || {};

  if (els.authSection) els.authSection.style.display = 'none';
  if (els.memberSection) els.memberSection.style.display = 'block';
  if (els.logoutBtn) els.logoutBtn.style.display = 'inline-flex';
  if (els.loginBtn) els.loginBtn.style.display = 'none';

  if (els.memberName) {
    els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  }

  if (els.memberPoints) {
    els.memberPoints.textContent = String(data.points ?? 0);
  }

  if (els.memberAvatar) {
    els.memberAvatar.src =
      member.avatar_url ||
      member.picture_url ||
      'https://placehold.co/96x96?text=User';
  }
}

function normalizeCategory(value) {
  const category = String(value ?? '').trim();
  return category || '未分類';
}

function getCategoriesFromRewards(rewards = []) {
  const categories = Array.from(
    new Set(
      rewards
        .map((item) => normalizeCategory(item.category))
        .filter((category) => category !== '未分類')
    )
  );

  return ['全部', ...categories];
}

function renderCategoryTabs() {
  if (!els.categoryTabs) return;

  const categories = getCategoriesFromRewards(state.allRewards);

  if (!categories.includes(state.selectedCategory)) {
    state.selectedCategory = '全部';
  }

  els.categoryTabs.innerHTML = categories
    .map(
      (category) => `
        <button
          class="category-tab ${category === state.selectedCategory ? 'active' : ''}"
          data-category="${escapeHtml(category)}"
          type="button"
        >
          ${escapeHtml(category)}
        </button>
      `
    )
    .join('');

  els.categoryTabs.querySelectorAll('.category-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.category || '全部';
      renderCategoryTabs();
      renderShopRewards();
    });
  });
}

function renderShopRewards() {
  if (!els.shopRewardsList) return;

  const list =
    state.selectedCategory === '全部'
      ? state.allRewards
      : state.allRewards.filter(
          (item) => normalizeCategory(item.category) === state.selectedCategory
        );

  if (els.shopSectionTitle) {
    els.shopSectionTitle.textContent =
      state.selectedCategory === '全部' ? '全部商品' : `${state.selectedCategory}商品`;
  }

  if (!list.length) {
    els.shopRewardsList.innerHTML = '<div class="empty-state">目前這個分類沒有商品</div>';
    return;
  }

  const loggedIn = !!state.dashboard?.member?.id;

  els.shopRewardsList.innerHTML = list
    .map((reward) => {
      const stockEmpty = Number(reward.stock ?? 0) <= 0;
      const disabled = !loggedIn || stockEmpty ? 'disabled' : '';
      const imageUrl = reward.image_url || 'https://placehold.co/600x400?text=Reward';

      return `
        <div class="reward-card">
          <img class="reward-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(reward.name)}">
          <div class="reward-body">
            <span class="reward-category">${escapeHtml(normalizeCategory(reward.category))}</span>
            <h3>${escapeHtml(reward.name)}</h3>
            <p>${escapeHtml(reward.description || '')}</p>
            <div class="reward-meta">
              <span>${escapeHtml(reward.points_cost)} 點</span>
              <span>庫存 ${escapeHtml(reward.stock)}</span>
            </div>
            <button class="btn btn-primary shop-redeem-btn" type="button" data-reward-id="${escapeHtml(reward.id)}" ${disabled}>
              ${!loggedIn ? '登入後兌換' : stockEmpty ? '已無庫存' : '兌換'}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  els.shopRewardsList.querySelectorAll('.shop-redeem-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rewardId = Number(btn.dataset.rewardId);
      await redeemReward(rewardId, btn);
    });
  });
}

async function redeemReward(rewardId, button) {
  const key = `shop-redeem:${rewardId}`;
  try {
    startPending(key);
    setButtonLoading(button, true, '兌換中...');
    clearMessage();

    if (!state.dashboard?.member?.id) {
      throw new Error('請先登入後再兌換');
    }

    const result = await callApi('redeem', {
      memberId: state.dashboard.member.id,
      rewardId,
      requestId: makeRequestId(`redeem-${rewardId}`),
    });

    showMessage(result.message || '兌換成功');
    await bootstrapDashboard();
  } catch (error) {
    console.error('redeemReward error =', error);
    showMessage(normalizeError(error, '兌換失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(button, false);
  }
}

async function loadPublicData() {
  try {
    const data = await callApi('get_public_leaderboard', {}, { retryOnExpiredToken: false });
    state.allRewards = data.rewards || [];
    renderCategoryTabs();
    renderShopRewards();
  } catch (error) {
    console.error('loadPublicData error =', error);
    state.allRewards = [];
    renderCategoryTabs();
    renderShopRewards();
  }
}

async function bootstrapDashboard() {
  const data = await callApi('login');
  state.dashboard = data;
  state.allRewards = data.rewards || [];
  renderMember(data);
  renderCategoryTabs();
  renderShopRewards();
}

async function signIn() {
  try {
    clearMessage();

    const config = getConfig();
    if (!config.liffId) throw new Error('config.js 尚未設定 liffId');
    if (!window.liff) throw new Error('LIFF SDK 尚未載入');

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: getCleanAppUrl() });
      return;
    }

    await refreshAccessToken();
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

    resetAuthState();
    state.pending.clear();

    renderLoggedOut();
    renderShopRewards();
    showMessage('已登出');
  } catch (error) {
    console.error('signOut error =', error);
    showMessage(normalizeError(error, '登出失敗'), true);
  }
}

async function bootstrap() {
  if (state.isBootstrapping) return;
  state.isBootstrapping = true;

  clearMessage();

  try {
    const config = getConfig();

    if (!config.liffId) throw new Error('config.js 尚未設定 liffId');
    if (!config.supabaseUrl) throw new Error('config.js 尚未設定 supabaseUrl');
    if (!config.supabaseAnonKey) throw new Error('config.js 尚未設定 supabaseAnonKey');
    if (!config.apiFunctionName) throw new Error('config.js 尚未設定 apiFunctionName');
    if (!window.liff) throw new Error('LIFF SDK 尚未載入');

    await liff.init({
      liffId: config.liffId,
      withLoginOnExternalBrowser: true,
    });

    if (liff.isLoggedIn() && hasLiffRedirectParams()) {
      window.history.replaceState({}, document.title, getCleanAppUrl());
    }

    if (!liff.isLoggedIn()) {
      resetAuthState();
      renderLoggedOut();
      return;
    }

    await refreshAccessToken();
    await bootstrapDashboard();
  } catch (error) {
    console.error('bootstrap error =', error);
    resetAuthState();
    renderLoggedOut();
    showMessage(`初始化失敗：${normalizeError(error)}`, true);
  } finally {
    state.isBootstrapping = false;
    if (els.appReady) els.appReady.style.display = 'block';
  }
}

function bindEvents() {
  if (els.loginBtn) els.loginBtn.addEventListener('click', signIn);
  if (els.logoutBtn) els.logoutBtn.addEventListener('click', signOut);
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  renderLoggedOut();
  await loadPublicData();
  await bootstrap();
});
