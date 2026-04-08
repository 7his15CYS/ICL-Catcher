function getConfig() { return window.APP_CONFIG || {}; }

const els = {
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  messageBox: document.getElementById('message-box'),
  adminOnlySection: document.getElementById('admin-only-section'),
  forbiddenSection: document.getElementById('forbidden-section'),
  editorSection: document.getElementById('editor-section'),
  ordersSection: document.getElementById('orders-section'),
  campaignAdminList: document.getElementById('campaign-admin-list'),
  reloadCampaignsBtn: document.getElementById('reload-campaigns-btn'),
  newDraftBtn: document.getElementById('new-draft-btn'),
  editorTitle: document.getElementById('editor-title'),
  campaignId: document.getElementById('campaign-id'),
  campaignTitleInput: document.getElementById('campaign-title-input'),
  pointsPerDrawInput: document.getElementById('points-per-draw-input'),
  totalTicketsInput: document.getElementById('total-tickets-input'),
  maxDrawInput: document.getElementById('max-draw-input'),
  reserveSecondsInput: document.getElementById('reserve-seconds-input'),
  startsAtInput: document.getElementById('starts-at-input'),
  endsAtInput: document.getElementById('ends-at-input'),
  coverImageInput: document.getElementById('cover-image-input'),
  campaignDescriptionInput: document.getElementById('campaign-description-input'),
  prizeRows: document.getElementById('prize-rows'),
  addPrizeRowBtn: document.getElementById('add-prize-row-btn'),
  saveCampaignBtn: document.getElementById('save-campaign-btn'),
  publishCampaignBtn: document.getElementById('publish-campaign-btn'),
  pauseCampaignBtn: document.getElementById('pause-campaign-btn'),
  activateCampaignBtn: document.getElementById('activate-campaign-btn'),
  endCampaignBtn: document.getElementById('end-campaign-btn'),
  reloadOrdersBtn: document.getElementById('reload-orders-btn'),
  ordersList: document.getElementById('orders-list'),
};

const state = {
  accessToken: null,
  admin: null,
  campaigns: [],
  currentCampaign: null,
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

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}
function fromDatetimeLocalValue(value) {
  return value ? new Date(value).toISOString() : null;
}

function setAdminMode(isAdmin) {
  els.loginBtn.style.display = isAdmin ? 'none' : 'inline-flex';
  els.logoutBtn.style.display = state.accessToken ? 'inline-flex' : 'none';
  els.adminOnlySection.style.display = isAdmin ? 'block' : 'none';
  els.editorSection.style.display = isAdmin ? 'block' : 'none';
  els.ordersSection.style.display = isAdmin ? 'block' : 'none';
  els.forbiddenSection.style.display = isAdmin ? 'none' : 'block';
}

function emptyPrizeRow(prize = {}) {
  const row = document.createElement('div');
  row.className = 'prize-row';
  row.innerHTML = `
    <input class="input prize-code" type="text" placeholder="代號 A" value="${escapeHtml(prize.prize_code || '')}">
    <input class="input prize-name" type="text" placeholder="獎項名稱" value="${escapeHtml(prize.prize_name || '')}">
    <input class="input prize-qty" type="number" min="1" placeholder="數量" value="${escapeHtml(prize.total_quantity || '')}">
    <input class="input prize-order" type="number" min="0" placeholder="排序" value="${escapeHtml(prize.display_order || 0)}">
    <input class="input prize-image" type="text" placeholder="圖片 URL" value="${escapeHtml(prize.prize_image_url || '')}">
    <button class="btn btn-danger remove-prize-row" type="button">刪除</button>
  `;
  row.querySelector('.remove-prize-row').addEventListener('click', () => row.remove());
  return row;
}

function collectPrizeRows() {
  return Array.from(els.prizeRows.querySelectorAll('.prize-row')).map((row) => ({
    prize_code: row.querySelector('.prize-code').value.trim(),
    prize_name: row.querySelector('.prize-name').value.trim(),
    total_quantity: Number(row.querySelector('.prize-qty').value || 0),
    display_order: Number(row.querySelector('.prize-order').value || 0),
    prize_image_url: row.querySelector('.prize-image').value.trim() || null,
  }));
}

function populateEditor(campaign = null, prizes = []) {
  state.currentCampaign = campaign;
  els.editorTitle.textContent = campaign?.id ? `編輯活動 #${campaign.id}` : '新增草稿活動';
  els.campaignId.value = campaign?.id || '';
  els.campaignTitleInput.value = campaign?.title || '';
  els.pointsPerDrawInput.value = campaign?.points_per_draw || '';
  els.totalTicketsInput.value = campaign?.total_tickets || '';
  els.maxDrawInput.value = campaign?.max_draw_per_order || 1;
  els.reserveSecondsInput.value = campaign?.reserve_seconds || 90;
  els.startsAtInput.value = toDatetimeLocalValue(campaign?.starts_at);
  els.endsAtInput.value = toDatetimeLocalValue(campaign?.ends_at);
  els.coverImageInput.value = campaign?.cover_image_url || '';
  els.campaignDescriptionInput.value = campaign?.description || '';
  els.prizeRows.innerHTML = '';
  (prizes.length ? prizes : [{}]).forEach((prize) => els.prizeRows.appendChild(emptyPrizeRow(prize)));

  const status = campaign?.status || 'draft';
  els.publishCampaignBtn.disabled = !campaign?.id || status !== 'draft';
  els.pauseCampaignBtn.disabled = !campaign?.id || status !== 'active';
  els.activateCampaignBtn.disabled = !campaign?.id || !['paused', 'draft'].includes(status);
  els.endCampaignBtn.disabled = !campaign?.id || status === 'ended';
}

function renderCampaignList() {
  if (!state.campaigns.length) {
    els.campaignAdminList.innerHTML = '<div class="empty-state">目前沒有活動</div>';
    return;
  }
  els.campaignAdminList.innerHTML = state.campaigns.map((campaign) => `
    <div class="list-item">
      <div class="list-fill">
        <div class="list-title">#${campaign.id} ${escapeHtml(campaign.title)}</div>
        <div class="list-subtitle">${escapeHtml(campaign.status)} ・ ${escapeHtml(campaign.points_per_draw)} 點 / 抽 ・ 剩餘 ${escapeHtml(campaign.remaining_tickets)}</div>
      </div>
      <button class="btn btn-secondary load-campaign-btn" type="button" data-id="${campaign.id}">載入</button>
    </div>
  `).join('');
  els.campaignAdminList.querySelectorAll('.load-campaign-btn').forEach((btn) => {
    btn.addEventListener('click', () => loadCampaignDetail(Number(btn.dataset.id)));
  });
}

function renderOrders(orders = []) {
  if (!orders.length) {
    els.ordersList.innerHTML = '<div class="empty-state">目前沒有抽獎紀錄</div>';
    return;
  }
  els.ordersList.innerHTML = orders.map((order) => `
    <div class="list-item block-item">
      <div class="list-title">${escapeHtml(order.member_nickname || '會員')} ・ ${escapeHtml(order.draw_count)} 抽</div>
      <div class="list-subtitle">${new Date(order.created_at).toLocaleString('zh-TW')} ・ 扣 ${escapeHtml(order.points_spent)} 點</div>
      <div class="result-tags">${(order.results || []).map((r) => `<span class="tag">${escapeHtml(r.prize_code)}賞 ${escapeHtml(r.prize_name)}</span>`).join('')}</div>
    </div>
  `).join('');
}

async function loadCampaigns() {
  const data = await callApi('admin_list_kuji_campaigns');
  state.campaigns = data.campaigns || [];
  renderCampaignList();
}

async function loadCampaignDetail(campaignId) {
  const [detail, orders] = await Promise.all([
    callApi('admin_get_kuji_campaign_detail', { campaignId }),
    callApi('admin_get_kuji_orders', { campaignId }),
  ]);
  populateEditor(detail.campaign, detail.prizes || []);
  renderOrders(orders.orders || []);
}

async function bootstrap() {
  try {
    const config = getConfig();
    if (!config.liffId || !config.supabaseUrl || !config.supabaseAnonKey || !config.apiFunctionName) {
      throw new Error('請先設定 config.js');
    }
    await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: false });
    if (!liff.isLoggedIn()) {
      setAdminMode(false);
      return;
    }
    state.accessToken = liff.getAccessToken();
    const login = await callApi('login');
    state.admin = login.member || null;
    if (!state.admin?.is_admin) {
      setAdminMode(false);
      return;
    }
    setAdminMode(true);
    await loadCampaigns();
    populateEditor();
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
  if (liff.isLoggedIn()) liff.logout();
  state.accessToken = null;
  state.admin = null;
  setAdminMode(false);
  showMessage('已登出');
}

async function saveCampaign() {
  const key = 'saveCampaign';
  try {
    startPending(key);
    setButtonLoading(els.saveCampaignBtn, true);
    const payload = {
      campaignId: els.campaignId.value ? Number(els.campaignId.value) : null,
      title: els.campaignTitleInput.value,
      description: els.campaignDescriptionInput.value,
      coverImageUrl: els.coverImageInput.value,
      pointsPerDraw: Number(els.pointsPerDrawInput.value || 0),
      totalTickets: Number(els.totalTicketsInput.value || 0),
      maxDrawPerOrder: Number(els.maxDrawInput.value || 0),
      reserveSeconds: Number(els.reserveSecondsInput.value || 0),
      startsAt: fromDatetimeLocalValue(els.startsAtInput.value),
      endsAt: fromDatetimeLocalValue(els.endsAtInput.value),
      prizes: collectPrizeRows(),
    };
    const data = await callApi('admin_save_kuji_campaign', payload);
    showMessage(data.message || '草稿已儲存');
    await loadCampaigns();
    await loadCampaignDetail(Number(data.campaignId));
  } catch (error) {
    showMessage(normalizeError(error, '儲存失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(els.saveCampaignBtn, false);
  }
}

async function publishCampaign() {
  const key = 'publishCampaign';
  try {
    startPending(key);
    setButtonLoading(els.publishCampaignBtn, true);
    const campaignId = Number(els.campaignId.value || 0);
    const data = await callApi('admin_publish_kuji_campaign', { campaignId });
    showMessage(data.message || '活動已上架');
    await loadCampaigns();
    await loadCampaignDetail(campaignId);
  } catch (error) {
    showMessage(normalizeError(error, '上架失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(els.publishCampaignBtn, false);
  }
}

async function changeStatus(status, button) {
  const key = `status:${status}`;
  try {
    startPending(key);
    setButtonLoading(button, true);
    const campaignId = Number(els.campaignId.value || 0);
    const data = await callApi('admin_change_kuji_campaign_status', { campaignId, status });
    showMessage(data.message || '活動狀態已更新');
    await loadCampaigns();
    await loadCampaignDetail(campaignId);
  } catch (error) {
    showMessage(normalizeError(error, '更新狀態失敗'), true);
  } finally {
    endPending(key);
    setButtonLoading(button, false);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.reloadCampaignsBtn?.addEventListener('click', async () => { await loadCampaigns(); showMessage('活動列表已更新'); });
els.newDraftBtn?.addEventListener('click', () => { populateEditor(); renderOrders([]); clearMessage(); });
els.addPrizeRowBtn?.addEventListener('click', () => els.prizeRows.appendChild(emptyPrizeRow()));
els.saveCampaignBtn?.addEventListener('click', saveCampaign);
els.publishCampaignBtn?.addEventListener('click', publishCampaign);
els.pauseCampaignBtn?.addEventListener('click', () => changeStatus('paused', els.pauseCampaignBtn));
els.activateCampaignBtn?.addEventListener('click', () => changeStatus('active', els.activateCampaignBtn));
els.endCampaignBtn?.addEventListener('click', () => changeStatus('ended', els.endCampaignBtn));
els.reloadOrdersBtn?.addEventListener('click', async () => {
  const id = Number(els.campaignId.value || 0);
  if (!id) return;
  const data = await callApi('admin_get_kuji_orders', { campaignId: id });
  renderOrders(data.orders || []);
  showMessage('抽獎紀錄已更新');
});
bootstrap();
