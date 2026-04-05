const config = window.APP_CONFIG;
const state = {
  accessToken: null,
  idToken: null,
  dashboard: null,
};

const $ = (id) => document.getElementById(id);

function showMessage(text, isError = false) {
  const el = $('message');
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('error', !!isError);
}
function clearMessage() {
  const el = $('message');
  el.textContent = '';
  el.classList.add('hidden');
  el.classList.remove('error');
}

async function callApi(action, payload = {}) {
  const url = `${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
    },
    body: JSON.stringify({
      action,
      accessToken: state.accessToken,
      idToken: state.idToken,
      ...payload,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `API 失敗：${res.status}`);
  }
  return data;
}

function renderLoggedOut() {
  $('logged-out').classList.remove('hidden');
  $('dashboard').classList.add('hidden');
  $('login-btn').classList.remove('hidden');
  $('logout-btn').classList.add('hidden');
}

function renderDashboard(data) {
  state.dashboard = data;
  $('logged-out').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  $('login-btn').classList.add('hidden');
  $('logout-btn').classList.remove('hidden');

  $('site-title').textContent = config.siteName || '娃娃機會員點數中心';
  $('member-name').textContent = data.member.display_name;
  $('member-avatar').src = data.member.picture_url || 'https://placehold.co/120x120?text=User';
  $('member-subtitle').textContent = `LINE ID：${data.member.line_user_id}`;
  $('member-points').textContent = data.member.points;
  $('member-role').textContent = data.member.is_admin ? '管理員' : '一般會員';
  $('admin-panel').classList.toggle('hidden', !data.member.is_admin);

  $('leaderboard').innerHTML = data.leaderboard.length
    ? data.leaderboard.map((row, idx) => `
      <div class="list-item">
        <strong>#${idx + 1} ${escapeHtml(row.display_name)}</strong>
        <div class="muted">${row.points} 點</div>
      </div>`).join('')
    : '<p class="muted">目前沒有排行榜資料</p>';

  $('rewards').innerHTML = data.rewards.length
    ? data.rewards.map((reward) => `
      <div class="reward-card">
        <img src="${escapeAttr(reward.image_url || 'https://placehold.co/600x400?text=Prize')}" alt="${escapeAttr(reward.name)}" />
        <div class="reward-body">
          <h3>${escapeHtml(reward.name)}</h3>
          <p class="muted">${escapeHtml(reward.description || '')}</p>
          <div class="reward-meta">
            <strong>${reward.points_cost} 點</strong>
            <span class="muted">庫存 ${reward.stock}</span>
          </div>
          <button class="primary-btn" onclick="redeemReward(${reward.id})" ${reward.stock <= 0 ? 'disabled' : ''}>立即兌換</button>
        </div>
      </div>`).join('')
    : '<p class="muted">目前沒有商品</p>';

  $('redemptions').innerHTML = data.redemptions.length
    ? data.redemptions.map((item) => `
      <div class="list-item">
        <strong>${escapeHtml(item.reward_name)}</strong>
        <div class="muted">${item.points_spent} 點｜${escapeHtml(item.status)}｜${formatDate(item.created_at)}</div>
      </div>`).join('')
    : '<p class="muted">還沒有兌換紀錄</p>';

  $('ledger').innerHTML = data.ledger.length
    ? data.ledger.map((item) => `
      <div class="list-item">
        <strong>${item.delta > 0 ? '+' : ''}${item.delta} 點</strong>
        <div>${escapeHtml(item.reason)}</div>
        <div class="muted">${formatDate(item.created_at)}</div>
      </div>`).join('')
    : '<p class="muted">目前沒有點數流水</p>';
}

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escapeAttr(v) { return escapeHtml(v); }
function formatDate(v) {
  try { return new Date(v).toLocaleString('zh-TW'); } catch { return v; }
}

async function bootstrap() {
  clearMessage();
  try {
    if (!config?.liffId) throw new Error('config.js 尚未設定 liffId');
    if (!config?.supabaseUrl) throw new Error('config.js 尚未設定 supabaseUrl');
    if (!config?.supabaseAnonKey) throw new Error('config.js 尚未設定 supabaseAnonKey');

    await liff.init({ liffId: config.liffId });

    if (!liff.isLoggedIn()) {
      renderLoggedOut();
      return;
    }

    state.accessToken = liff.getAccessToken();
    state.idToken = liff.getIDToken();

    const dashboard = await callApi('bootstrap');
    renderDashboard(dashboard);
  } catch (error) {
    console.error(error);
    renderLoggedOut();
    showMessage(`初始化失敗：${error.message}`, true);
  }
}

async function signInWithLine() {
  clearMessage();
  try {
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href.split('#')[0] });
      return;
    }
    await bootstrap();
  } catch (error) {
    showMessage(`登入失敗：${error.message}`, true);
  }
}

async function signOut() {
  try {
    if (liff.isLoggedIn()) {
      liff.logout();
    }
    state.accessToken = null;
    state.idToken = null;
    renderLoggedOut();
  } catch (error) {
    showMessage(`登出失敗：${error.message}`, true);
  }
}

async function redeemReward(rewardId) {
  clearMessage();
  if (!confirm('確定要兌換這個商品嗎？')) return;
  try {
    const result = await callApi('redeem', { rewardId });
    showMessage(result.message || '兌換成功');
    renderDashboard(result.dashboard);
  } catch (error) {
    showMessage(`兌換失敗：${error.message}`, true);
  }
}
window.redeemReward = redeemReward;

async function searchMembers() {
  clearMessage();
  try {
    const keyword = $('member-search-keyword').value.trim();
    const result = await callApi('admin_search', { keyword });
    $('member-search-results').innerHTML = result.members.length
      ? result.members.map((member) => `
        <div class="search-result">
          <div>
            <strong>${escapeHtml(member.display_name)}</strong>
            <div class="muted">${member.points} 點｜${escapeHtml(member.line_user_id)}</div>
          </div>
          <button class="secondary-btn" onclick="pickMember('${member.id.replaceAll("'", "") || ''}')">選取</button>
        </div>`).join('')
      : '<p class="muted">找不到會員</p>';
  } catch (error) {
    showMessage(`搜尋失敗：${error.message}`, true);
  }
}

function pickMember(memberId) {
  $('grant-target-id').value = memberId;
}
window.pickMember = pickMember;

async function grantPoints() {
  clearMessage();
  try {
    const targetMemberId = $('grant-target-id').value.trim();
    const points = Number($('grant-points').value);
    const reason = $('grant-reason').value.trim();
    const result = await callApi('admin_grant', { targetMemberId, points, reason });
    showMessage(result.message || '加點成功');
    $('grant-points').value = '';
    $('grant-reason').value = '';
  } catch (error) {
    showMessage(`加點失敗：${error.message}`, true);
  }
}

$('login-btn').addEventListener('click', signInWithLine);
$('logout-btn').addEventListener('click', signOut);
$('member-search-btn').addEventListener('click', searchMembers);
$('grant-btn').addEventListener('click', grantPoints);

document.addEventListener('DOMContentLoaded', bootstrap);
