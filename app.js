function getConfig() { return window.APP_CONFIG || {}; }

const els = {
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
  kujiSummary: document.getElementById('kuji-summary'),
  adminEntrySection: document.getElementById('admin-entry-section'),
};

const state = {
  accessToken: null,
  dashboard: null,
  kujiCampaigns: [],
  pending: new Set(),
};

function normalizeError(err, fallback = '發生錯誤') {
  if (typeof err === 'string') return err;
  if (err?.message) return err.message;
  if (err?.error) return err.error;
  return fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function startPending(key) {
  if (state.pending.has(key)) throw new Error('上一個操作尚未完成');
  state.pending.add(key);
}
function endPending(key) { state.pending.delete(key); }

async function callApi(action, payload = {}) {
  const config = getConfig();
  const res = await fetch(`${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabaseAnonKey,
    },
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
  els.adminEntrySection.style.display = 'none';
}

function renderMember(data) {
  const member = data.member || {};
  els.authSection.style.display = 'none';
  els.memberSection.style.display = 'block';
  els.logoutBtn.style.display = 'inline-flex';
  els.loginBtn.style.display = 'none';
  els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  els.memberPoints.textContent = String(data.points ?? 0);
  els.nicknameInput.value = member.nickname || '';
  els.memberAvatar.src = member.avatar_url || 'https://placehold.co/96x96?text=User';
  els.adminEntrySection.style.display = member.is_admin ? 'block' : 'none';
}

function renderRewards() {
  const rewards = state.dashboard?.rewards || [];
  if (!rewards.length) {
    els.rewardsList.innerHTML = '<div class="empty-state">目前沒有可兌換商品</div>';
    return;
  }
  els.rewardsList.innerHTML = rewards.map((reward) => `
    <article class="reward-card">
      <img class="reward-image" src="${escapeHtml(reward.image_url || 'https://placehold.co/600x400?text=Reward')}" alt="${escapeHtml(reward.name)}">
      <div class="reward-body">
        <span class="badge">${escapeHtml(reward.category || '兌換商品')}</span>
        <h3>${escapeHtml(reward.name)}</h3>
        <p>${escapeHtml(reward.description || '暫無說明')}</p>
        <div class="reward-meta"><span>${escapeHtml(reward.points_cost)} 點</span><span>庫存 ${escapeHtml(reward.stock)}</span></div>
      </div>
    </article>
  `).join('');
}

function renderRedemptions() {
  const list = state.dashboard?.redemptions || [];
  if (!list.length) {
    els.redemptionList.innerHTML = '<div class="empty-state">目前沒有兌換紀錄</div>';
    return;
  }
  els.redemptionList.innerHTML = list.map((item) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(item.reward_name)}</div>
        <div class="list-subtitle">${new Date(item.created_at).toLocaleString('zh-TW')} ・ ${escapeHtml(item.status)}</div>
      </div>
      <div class="list-points">-${escapeHtml(item.points_spent)} 點</div>
    </div>
  `).join('');
}

function renderLeaderboard() {
  const list = state.dashboard?.leaderboard || [];
  if (!list.length) {
    els.leaderboardList.innerHTML = '<div class="empty-state">目前沒有排行榜資料</div>';
    return;
  }
  els.leaderboardList.innerHTML = list.map((item, index) => `
    <div class="list-item">
      <div class="rank-badge">${index + 1}</div>
      <img class="avatar-xs" src="${escapeHtml(item.avatar_url || 'https://placehold.co/48x48?text=U')}" alt="avatar">
      <div class="list-fill">
        <div class="list-title">${escapeHtml(item.display_name)}</div>
      </div>
      <div class="list-points">${escapeHtml(item.points)} 點</div>
    </div>
  `).join('');
}

function renderKujiSummary() {
  const campaigns = state.kujiCampaigns || [];
  if (!campaigns.length) {
    els.kujiSummary.innerHTML = '<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.kujiSummary.innerHTML = campaigns.map((campaign) => `
    <article class="reward-card">
      <img class="reward-image" src="${escapeHtml(campaign.cover_image_url || 'https://placehold.co/600x400?text=KUJI')}" alt="${escapeHtml(campaign.title)}">
      <div class="reward-body">
        <span class="badge">線上一番賞</span>
        <h3>${escapeHtml(campaign.title)}</h3>
        <p>${escapeHtml(campaign.description || '暫無活動說明')}</p>
        <div class="reward-meta">
          <span>${escapeHtml(campaign.points_per_draw)} 點 / 抽</span>
          <span>剩餘 ${escapeHtml(campaign.remaining_tickets)} / ${escapeHtml(campaign.total_tickets)}</span>
        </div>
        <a class="btn btn-primary" href="./kuji.html?campaignId=${encodeURIComponent(campaign.id)}">進入活動</a>
      </div>
    </article>
  `).join('');
}

async function loadDashboard() {
  const data = await callApi('login');
  state.dashboard = data;
  renderMember(data);
  renderRewards();
  renderRedemptions();
  renderLeaderboard();
}

async function loadKujiCampaigns() {
  const data = await callApi('get_kuji_campaigns');
  state.kujiCampaigns = data.campaigns || [];
  renderKujiSummary();
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
      await loadKujiCampaigns();
      return;
    }
    state.accessToken = liff.getAccessToken();
    await Promise.all([loadDashboard(), loadKujiCampaigns()]);
  } catch (error) {
    renderLoggedOut();
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

async function signIn() {
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: `${window.location.origin}${window.location.pathname}` });
    return;
  }
  await bootstrap();
}

function signOut() {
  if (liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.dashboard = null;
  renderLoggedOut();
  showMessage('已登出');
}

async function saveNickname() {
  const key = 'saveNickname';
  try {
    startPending(key);
    setButtonLoading(els.nicknameSaveBtn, true);
    clearMessage();
    const data = await callApi('update_nickname', { nickname: els.nicknameInput.value });
    state.dashboard = data;
    renderMember(data);
    renderLeaderboard();
    showMessage('暱稱更新成功');
  } catch (error) {
    showMessage(normalizeError(error, '暱稱更新失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(els.nicknameSaveBtn, false);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.nicknameSaveBtn?.addEventListener('click', saveNickname);
bootstrap();
