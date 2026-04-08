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
  memberRoleBadge: document.getElementById('member-role-badge'),
  nicknameInput: document.getElementById('nickname-input'),
  nicknameSaveBtn: document.getElementById('nickname-save-btn'),
  rewardsList: document.getElementById('rewards-list'),
  redemptionList: document.getElementById('redemption-list'),
  leaderboardList: document.getElementById('leaderboard-list'),
  kujiSummary: document.getElementById('kuji-summary'),
  adminKujiLink: document.getElementById('admin-kuji-link'),
};

const state = { accessToken: null, dashboard: null, campaigns: [] };

function escapeHtml(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
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
function setButtonLoading(button, loading, label = '處理中...') {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent || '';
  button.disabled = loading;
  button.textContent = loading ? label : button.dataset.originalText;
}
function getCleanAppUrl() { return `${window.location.origin}${window.location.pathname}`; }
async function callApi(action, payload = {}, includeToken = true) {
  const config = getConfig();
  const body = { action, ...payload };
  if (includeToken && state.accessToken) body.accessToken = state.accessToken;
  const res = await fetch(`${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!res.ok || data.ok === false) throw data;
  return data;
}

function renderLoggedOut() {
  els.memberSection.style.display = 'none';
  els.loginBtn.style.display = 'inline-flex';
  els.logoutBtn.style.display = 'none';
  if (els.adminKujiLink) els.adminKujiLink.style.display = 'none';
}
function renderMember(data) {
  const member = data.member || {};
  els.memberSection.style.display = 'block';
  els.loginBtn.style.display = 'none';
  els.logoutBtn.style.display = 'inline-flex';
  els.memberName.textContent = member.nickname || member.display_name || 'LINE 會員';
  els.memberAvatar.src = member.avatar_url || 'https://placehold.co/96x96?text=User';
  els.memberPoints.textContent = String(data.points ?? 0);
  els.nicknameInput.value = member.nickname || '';
  els.memberRoleBadge.textContent = member.is_admin ? '管理員' : '一般會員';
  if (els.adminKujiLink) els.adminKujiLink.style.display = member.is_admin ? 'inline' : 'none';
}
function renderRewards(rewards = []) {
  if (!rewards.length) {
    els.rewardsList.innerHTML = '<div class="empty-state">目前沒有可兌換獎品</div>';
    return;
  }
  els.rewardsList.innerHTML = rewards.map((reward) => `
    <article class="reward-card">
      <img class="reward-image" src="${escapeHtml(reward.image_url || 'https://placehold.co/640x360?text=Reward')}" alt="${escapeHtml(reward.name)}">
      <div class="reward-body">
        <span class="reward-category">點數兌換</span>
        <h3>${escapeHtml(reward.name)}</h3>
        <p>${escapeHtml(reward.description || '')}</p>
        <div class="reward-meta"><span>${Number(reward.points_cost || 0)} 點</span><span>庫存 ${Number(reward.stock || 0)}</span></div>
      </div>
    </article>`).join('');
}
function renderRedemptions(items = []) {
  if (!items.length) {
    els.redemptionList.innerHTML = '<div class="empty-state">你還沒有兌換紀錄</div>';
    return;
  }
  els.redemptionList.innerHTML = items.map((item) => `
    <div class="list-item">
      <div>
        <div class="list-title">${escapeHtml(item.reward_name)}</div>
        <div class="list-subtitle">${new Date(item.created_at).toLocaleString('zh-TW')} ・ 狀態 ${escapeHtml(item.status)}</div>
      </div>
      <div class="list-points">-${Number(item.points_spent || 0)} 點</div>
    </div>`).join('');
}
function renderLeaderboard(items = []) {
  if (!items.length) {
    els.leaderboardList.innerHTML = '<div class="empty-state">目前沒有排行榜資料</div>';
    return;
  }
  els.leaderboardList.innerHTML = items.map((item, index) => `
    <div class="list-item">
      <div class="rank-badge">#${index + 1}</div>
      <img class="mini-avatar" src="${escapeHtml(item.avatar_url || 'https://placehold.co/48x48?text=User')}" alt="${escapeHtml(item.display_name)}">
      <div class="list-grow">
        <div class="list-title">${escapeHtml(item.display_name)}</div>
      </div>
      <div class="list-points">${Number(item.points || 0)} 點</div>
    </div>`).join('');
}
function renderKujiSummary(campaigns = []) {
  if (!campaigns.length) {
    els.kujiSummary.innerHTML = '<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.kujiSummary.innerHTML = campaigns.map((campaign) => `
    <article class="reward-card">
      <img class="reward-image" src="${escapeHtml(campaign.cover_image_url || 'https://placehold.co/640x360?text=KUJI')}" alt="${escapeHtml(campaign.title)}">
      <div class="reward-body">
        <span class="reward-category">線上一番賞</span>
        <h3>${escapeHtml(campaign.title)}</h3>
        <p>${escapeHtml(campaign.description || '')}</p>
        <div class="reward-meta"><span>${Number(campaign.points_per_draw || 0)} 點 / 抽</span><span>剩餘 ${Number(campaign.remaining_tickets || 0)}</span></div>
        <a class="btn btn-primary card-link" href="./kuji.html?campaignId=${encodeURIComponent(campaign.id)}">進入活動</a>
      </div>
    </article>`).join('');
}

async function loadCampaigns() {
  const data = await callApi('get_kuji_campaigns', {}, false);
  state.campaigns = data.campaigns || [];
  renderKujiSummary(state.campaigns);
}
async function loadDashboard() {
  const data = await callApi('login');
  state.dashboard = data;
  renderMember(data);
  renderRewards(data.rewards || []);
  renderRedemptions(data.redemptions || []);
  renderLeaderboard(data.leaderboard || []);
}
async function signIn() {
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: getCleanAppUrl() });
    return;
  }
  await bootstrap();
}
async function signOut() {
  if (window.liff && liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.dashboard = null;
  renderLoggedOut();
  showMessage('已登出');
}
async function bootstrap() {
  try {
    const config = getConfig();
    if (!config.liffId || !config.supabaseUrl || !config.supabaseAnonKey || !config.apiFunctionName) throw new Error('請先設定 config.js');
    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: false });
    await loadCampaigns();
    if (!liff.isLoggedIn()) {
      renderLoggedOut();
      return;
    }
    state.accessToken = liff.getAccessToken();
    await loadDashboard();
  } catch (error) {
    renderLoggedOut();
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.nicknameSaveBtn?.addEventListener('click', async () => {
  try {
    setButtonLoading(els.nicknameSaveBtn, true);
    clearMessage();
    const data = await callApi('update_nickname', { nickname: els.nicknameInput.value });
    state.dashboard = data;
    renderMember(data);
    renderLeaderboard(data.leaderboard || []);
    showMessage(data.message || '暱稱更新成功');
  } catch (error) {
    showMessage(normalizeError(error, '更新暱稱失敗'), true);
  } finally {
    setButtonLoading(els.nicknameSaveBtn, false);
  }
});

bootstrap();
