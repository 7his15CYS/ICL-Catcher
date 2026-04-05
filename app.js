import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.APP_CONFIG;
if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
  document.body.innerHTML = '<div style="padding:24px;font-family:sans-serif;">請先建立 config.js，並填入 Supabase 設定。</div>';
  throw new Error('Missing config');
}

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
let currentUser = null;
let currentProfile = null;
let selectedMember = null;

const $ = (id) => document.getElementById(id);
const els = {
  authArea: $('authArea'),
  loginBtn: $('loginBtn'),
  logoutBtn: $('logoutBtn'),
  guestSection: $('guestSection'),
  memberSection: $('memberSection'),
  adminSection: $('adminSection'),
  messageBox: $('messageBox'),
  displayName: $('displayName'),
  avatar: $('avatar'),
  memberSince: $('memberSince'),
  pointsValue: $('pointsValue'),
  rankValue: $('rankValue'),
  leaderboard: $('leaderboard'),
  rewardsGrid: $('rewardsGrid'),
  historyList: $('historyList'),
  reloadRewardsBtn: $('reloadRewardsBtn'),
  memberKeyword: $('memberKeyword'),
  searchMemberBtn: $('searchMemberBtn'),
  memberResults: $('memberResults'),
  grantPanel: $('grantPanel'),
  selectedMemberName: $('selectedMemberName'),
  grantPointsInput: $('grantPointsInput'),
  grantReasonInput: $('grantReasonInput'),
  grantPointsBtn: $('grantPointsBtn')
};

function showMessage(text, isError = false) {
  els.messageBox.textContent = text;
  els.messageBox.classList.remove('hidden');
  els.messageBox.style.background = isError ? '#fef2f2' : '#eff6ff';
  els.messageBox.style.borderColor = isError ? '#fecaca' : '#bfdbfe';
}

function clearMessage() {
  els.messageBox.classList.add('hidden');
  els.messageBox.textContent = '';
}

function formatDate(isoString) {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleString('zh-TW', { hour12: false });
}

function sanitizeText(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function signInWithLine() {
  clearMessage();
  const redirectTo = window.location.href.split('?')[0].split('#')[0];

  const { error } = await supabase.auth.signInWithOAuth({
    provider: config.lineProvider,
    options: { redirectTo }
  });

  if (error) showMessage(`登入失敗：${error.message}`, true);
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showMessage(`登出失敗：${error.message}`, true);
    return;
  }
  window.location.reload();
}

async function ensureProfile() {
  const { error } = await supabase.rpc('ensure_profile');
  if (error) throw error;
}

async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, created_at')
    .eq('id', currentUser.id)
    .single();
  if (error) throw error;
  currentProfile = data;

  els.displayName.textContent = data.display_name || '會員';
  els.avatar.src = data.avatar_url || 'https://placehold.co/200x200?text=Member';
  els.memberSince.textContent = `加入時間：${formatDate(data.created_at)}`;

  if (data.role === 'admin') {
    els.adminSection.classList.remove('hidden');
  } else {
    els.adminSection.classList.add('hidden');
  }
}

async function loadPoints() {
  const { data, error } = await supabase.rpc('get_my_points');
  if (error) throw error;
  els.pointsValue.textContent = Number(data || 0).toLocaleString('zh-TW');
}

async function loadLeaderboard() {
  const { data, error } = await supabase.rpc('get_leaderboard', { limit_n: 10 });
  if (error) throw error;

  if (!data?.length) {
    els.leaderboard.innerHTML = '<div class="empty">目前還沒有排行榜資料</div>';
    els.rankValue.textContent = '-';
    return;
  }

  let myRank = '-';
  els.leaderboard.innerHTML = data.map((item, index) => {
    if (item.user_id === currentUser.id) myRank = index + 1;
    return `
      <div class="list-item">
        <div>
          <strong>#${index + 1} ${sanitizeText(item.display_name)}</strong>
        </div>
        <div>${Number(item.points).toLocaleString('zh-TW')} 點</div>
      </div>
    `;
  }).join('');
  els.rankValue.textContent = myRank;
}

async function loadRewards() {
  const { data, error } = await supabase
    .from('reward_catalog')
    .select('id, name, description, image_url, points_cost, stock, is_active')
    .eq('is_active', true)
    .order('points_cost', { ascending: true });

  if (error) throw error;

  if (!data?.length) {
    els.rewardsGrid.innerHTML = '<div class="empty">目前沒有上架商品</div>';
    return;
  }

  els.rewardsGrid.innerHTML = data.map((reward) => `
    <article class="reward-card">
      <img src="${sanitizeText(reward.image_url || 'https://placehold.co/600x400?text=Reward')}" alt="${sanitizeText(reward.name)}" />
      <div class="content">
        <h3>${sanitizeText(reward.name)}</h3>
        <p class="muted">${sanitizeText(reward.description || '尚無說明')}</p>
        <div class="reward-meta">
          <div>
            <strong>${Number(reward.points_cost).toLocaleString('zh-TW')} 點</strong><br />
            <span class="muted">庫存：${reward.stock}</span>
          </div>
          <button class="btn primary" data-redeem-id="${reward.id}">立即兌換</button>
        </div>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-redeem-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rewardId = Number(btn.dataset.redeemId);
      await redeemReward(rewardId);
    });
  });
}

async function redeemReward(rewardId) {
  clearMessage();
  const ok = window.confirm('確定要兌換這個商品嗎？');
  if (!ok) return;

  const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId });
  if (error) {
    showMessage(`兌換失敗：${error.message}`, true);
    return;
  }

  if (!data?.ok) {
    showMessage(`兌換失敗：${data?.message || '未知錯誤'}`, true);
    return;
  }

  showMessage(`兌換成功：${data.message}`);
  await Promise.all([loadPoints(), loadRewards(), loadHistory(), loadLeaderboard()]);
}

async function loadHistory() {
  const { data, error } = await supabase
    .from('redemption_orders')
    .select('id, reward_name, points_spent, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  if (!data?.length) {
    els.historyList.innerHTML = '<div class="empty">你還沒有兌換紀錄</div>';
    return;
  }

  els.historyList.innerHTML = data.map((row) => `
    <div class="list-item">
      <div>
        <strong>${sanitizeText(row.reward_name)}</strong><br />
        <span class="muted">${formatDate(row.created_at)}</span>
      </div>
      <div>
        <div>${row.points_spent} 點</div>
        <div class="muted">${sanitizeText(row.status)}</div>
      </div>
    </div>
  `).join('');
}

async function searchMembers() {
  const keyword = els.memberKeyword.value.trim();
  if (!keyword) {
    showMessage('請先輸入會員名稱關鍵字', true);
    return;
  }

  clearMessage();
  const { data, error } = await supabase.rpc('admin_search_members', { keyword });
  if (error) {
    showMessage(`搜尋會員失敗：${error.message}`, true);
    return;
  }

  if (!data?.length) {
    els.memberResults.innerHTML = '<div class="empty">找不到會員</div>';
    return;
  }

  els.memberResults.innerHTML = data.map((row) => `
    <div class="list-item">
      <div>
        <strong>${sanitizeText(row.display_name)}</strong><br />
        <span class="muted">${sanitizeText(row.id)}</span>
      </div>
      <button class="btn" data-member-id="${row.id}" data-member-name="${sanitizeText(row.display_name)}">選擇</button>
    </div>
  `).join('');

  document.querySelectorAll('[data-member-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMember = {
        id: btn.dataset.memberId,
        name: btn.dataset.memberName
      };
      els.selectedMemberName.textContent = selectedMember.name;
      els.grantPanel.classList.remove('hidden');
    });
  });
}

async function grantPoints() {
  if (!selectedMember?.id) {
    showMessage('請先選擇會員', true);
    return;
  }

  const points = Number(els.grantPointsInput.value);
  const reason = els.grantReasonInput.value.trim();

  if (!Number.isInteger(points) || points <= 0) {
    showMessage('點數必須是大於 0 的整數', true);
    return;
  }
  if (!reason) {
    showMessage('請輸入加點原因', true);
    return;
  }

  clearMessage();
  const { data, error } = await supabase.rpc('admin_grant_points', {
    p_user_id: selectedMember.id,
    p_points: points,
    p_reason: reason
  });

  if (error) {
    showMessage(`加點失敗：${error.message}`, true);
    return;
  }
  if (!data?.ok) {
    showMessage(`加點失敗：${data?.message || '未知錯誤'}`, true);
    return;
  }

  showMessage(`已成功為 ${selectedMember.name} 加 ${points} 點`);
  els.grantPointsInput.value = '';
  els.grantReasonInput.value = '';
}

async function renderLoggedOut() {
  currentUser = null;
  currentProfile = null;
  els.guestSection.classList.remove('hidden');
  els.memberSection.classList.add('hidden');
  els.adminSection.classList.add('hidden');
  els.loginBtn.classList.remove('hidden');
  els.logoutBtn.classList.add('hidden');
}

async function renderLoggedIn(session) {
  currentUser = session.user;
  els.guestSection.classList.add('hidden');
  els.memberSection.classList.remove('hidden');
  els.loginBtn.classList.add('hidden');
  els.logoutBtn.classList.remove('hidden');

  await ensureProfile();
  await loadProfile();
  await Promise.all([loadPoints(), loadRewards(), loadHistory(), loadLeaderboard()]);
}

async function init() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');

    // OAuth / PKCE callback: 用 code 換 session
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;

      // 清掉網址上的 code，避免重複交換
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const session = data.session;
    if (!session) {
      await renderLoggedOut();
      return;
    }

    await renderLoggedIn(session);
  } catch (error) {
    console.error(error);
    showMessage(`初始化失敗：${error.message}`, true);
  }
}

els.loginBtn.addEventListener('click', signInWithLine);
els.logoutBtn.addEventListener('click', signOut);
els.reloadRewardsBtn.addEventListener('click', loadRewards);
els.searchMemberBtn.addEventListener('click', searchMembers);
els.grantPointsBtn.addEventListener('click', grantPoints);

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (!session) {
    await renderLoggedOut();
    return;
  }
  await renderLoggedIn(session);
});

init();
