function getConfig() {
  return window.APP_CONFIG || {};
}

const els = {
  appReady: document.getElementById("app-ready"),
  authSection: document.getElementById("auth-section"),
  loginBtn: document.getElementById("login-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  messageBox: document.getElementById("message-box"),

  adminSection: document.getElementById("admin-section"),
  adminName: document.getElementById("admin-name"),
  adminAvatar: document.getElementById("admin-avatar"),

  // 會員點數管理
  memberKeyword: document.getElementById("member-keyword"),
  searchMembersBtn: document.getElementById("search-members-btn"),
  memberResultList: document.getElementById("member-result-list"),
  selectedMemberInfo: document.getElementById("selected-member-info"),
  pointAmount: document.getElementById("point-amount"),
  pointReason: document.getElementById("point-reason"),
  grantPointsBtn: document.getElementById("grant-points-btn"),
  deductPointsBtn: document.getElementById("deduct-points-btn"),

  // 活動列表
  campaignList: document.getElementById("campaign-list"),
  refreshCampaignsBtn: document.getElementById("refresh-campaigns-btn"),
  newDraftBtn: document.getElementById("new-draft-btn"),

  // 活動表單
  formTitle: document.getElementById("form-title"),
  campaignStatusBadge: document.getElementById("campaign-status-badge"),
  campaignId: document.getElementById("campaign-id"),
  campaignTitle: document.getElementById("campaign-title"),
  pointsPerDraw: document.getElementById("points-per-draw"),
  totalTickets: document.getElementById("total-tickets"),
  maxDrawPerOrder: document.getElementById("max-draw-per-order"),
  turnHoldSeconds: document.getElementById("turn-hold-seconds"),
  coverImageUrl: document.getElementById("cover-image-url"),
  startsAt: document.getElementById("starts-at"),
  endsAt: document.getElementById("ends-at"),
  description: document.getElementById("campaign-description"),

  prizeRows: document.getElementById("prize-rows"),
  addPrizeRowBtn: document.getElementById("add-prize-row-btn"),
  prizeSummary: document.getElementById("prize-summary"),

  saveDraftBtn: document.getElementById("save-draft-btn"),
  publishBtn: document.getElementById("publish-btn"),
  pauseBtn: document.getElementById("pause-btn"),
  resumeBtn: document.getElementById("resume-btn"),
  endBtn: document.getElementById("end-btn"),

  orderList: document.getElementById("order-list"),
};

const state = {
  accessToken: null,
  me: null,
  campaigns: [],
  selectedCampaignId: null,
  selectedCampaignStatus: "draft",
  selectedMember: null,
  pending: new Set(),
};

function normalizeError(err, fallback = "發生錯誤") {
  if (err == null) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "object") return err.message || err.error || fallback;
  return String(err);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showMessage(message, isError = false) {
  const text = typeof message === "string" ? message : normalizeError(message);
  if (!text) {
    els.messageBox.style.display = "none";
    return;
  }
  els.messageBox.textContent = text;
  els.messageBox.style.display = "block";
  els.messageBox.className = isError ? "message error" : "message success";
}

function clearMessage() {
  showMessage("");
}

function startPending(key) {
  if (state.pending.has(key)) throw new Error("上一個操作尚未完成");
  state.pending.add(key);
}

function endPending(key) {
  state.pending.delete(key);
}

function setButtonLoading(button, isLoading, loadingText = "處理中...") {
  if (!button) return;
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent || "";
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}

function makeRequestId(prefix) {
  return window.crypto?.randomUUID
    ? `${prefix}-${window.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}`;
}

function getCleanAppUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function callApi(action, payload = {}) {
  const config = getConfig();
  const url = `${config.supabaseUrl}/functions/v1/${config.apiFunctionName}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    data = { message: text };
  }

  if (!res.ok || data.ok === false) {
    throw data;
  }
  return data;
}

function renderLoggedOut() {
  els.authSection.style.display = "block";
  els.adminSection.style.display = "none";
  els.logoutBtn.style.display = "none";
  els.loginBtn.style.display = "inline-flex";
}

function renderAdmin(data) {
  const member = data.member || {};
  els.authSection.style.display = "none";
  els.adminSection.style.display = "block";
  els.logoutBtn.style.display = "inline-flex";
  els.loginBtn.style.display = "none";

  els.adminName.textContent = member.nickname || member.display_name || "管理員";
  els.adminAvatar.src = member.avatar_url || "https://placehold.co/96x96?text=Admin";
}

function ensureAdmin() {
  if (!state.me?.is_admin) {
    throw new Error("你不是管理員");
  }
}

function formatDateTimeInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimeText(value) {
  if (!value) return "未設定";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "未設定";
  return d.toLocaleString("zh-TW");
}

function getStatusLabel(status) {
  switch (status) {
    case "draft":
      return "draft";
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "ended":
      return "ended";
    default:
      return status || "-";
  }
}

function setCampaignStatusBadge(status) {
  state.selectedCampaignStatus = status || "draft";
  els.campaignStatusBadge.textContent = getStatusLabel(state.selectedCampaignStatus);
  els.campaignStatusBadge.className = `status-badge ${state.selectedCampaignStatus}`;
}

function resetSelectedMember() {
  state.selectedMember = null;
  if (els.selectedMemberInfo) {
    els.selectedMemberInfo.innerHTML = '<div class="empty-state">尚未選取會員</div>';
  }
}

function renderSelectedMember() {
  if (!state.selectedMember) {
    resetSelectedMember();
    return;
  }

  const member = state.selectedMember;
  els.selectedMemberInfo.innerHTML = `
    <div class="selected-member-card">
      <img class="selected-member-avatar" src="${escapeHtml(member.avatar_url || "https://placehold.co/80x80?text=User")}" alt="${escapeHtml(member.nickname || member.display_name || "會員")}">
      <div class="selected-member-meta">
        <div class="selected-member-name">${escapeHtml(member.nickname || member.display_name || "未命名會員")}</div>
        <div class="selected-member-sub">目前點數：${escapeHtml(member.current_points ?? 0)}</div>
        <div class="selected-member-sub">會員 ID：${escapeHtml(member.id)}</div>
      </div>
    </div>
  `;
}

function renderMemberSearchResults(members) {
  if (!members?.length) {
    els.memberResultList.innerHTML = '<div class="empty-state">找不到符合條件的會員</div>';
    return;
  }

  els.memberResultList.innerHTML = members.map((member) => `
    <button type="button" class="member-result-item" data-member-id="${escapeHtml(member.id)}">
      <img class="member-result-avatar" src="${escapeHtml(member.avatar_url || "https://placehold.co/64x64?text=User")}" alt="${escapeHtml(member.nickname || member.display_name || "會員")}">
      <div class="member-result-text">
        <div class="member-result-name">${escapeHtml(member.nickname || member.display_name || "未命名會員")}</div>
        <div class="member-result-sub">點數：${escapeHtml(member.current_points ?? 0)}</div>
      </div>
    </button>
  `).join("");

  els.memberResultList.querySelectorAll(".member-result-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const member = members.find((m) => String(m.id) === String(btn.dataset.memberId));
      if (!member) return;
      state.selectedMember = member;
      renderSelectedMember();
      showMessage(`已選取會員：${member.nickname || member.display_name || "未命名會員"}`);
    });
  });
}

function newPrizeRow(prize = {}) {
  const wrap = document.createElement("div");
  wrap.className = "prize-row";
  wrap.innerHTML = `
    <div class="prize-cell">
      <label class="prize-mobile-label">獎項代號</label>
      <input type="text" class="prize-code" placeholder="例如 A" value="${escapeHtml(prize.prize_code || "")}">
    </div>
    <div class="prize-cell prize-name-cell">
      <label class="prize-mobile-label">獎項名稱</label>
      <input type="text" class="prize-name" placeholder="例如 A賞大娃娃" value="${escapeHtml(prize.prize_name || "")}">
    </div>
    <div class="prize-cell">
      <label class="prize-mobile-label">數量</label>
      <input type="number" min="1" step="1" class="prize-quantity" placeholder="1" value="${escapeHtml(prize.total_quantity ?? "")}">
    </div>
    <div class="prize-cell">
      <label class="prize-mobile-label">排序</label>
      <input type="number" min="0" step="1" class="prize-order" placeholder="1" value="${escapeHtml(prize.display_order ?? "")}">
    </div>
    <div class="prize-cell">
      <label class="prize-mobile-label">圖片 URL</label>
      <input type="text" class="prize-image-url" placeholder="可留空" value="${escapeHtml(prize.prize_image_url || "")}">
    </div>
    <div class="prize-cell prize-action-cell">
      <label class="prize-mobile-label">操作</label>
      <button type="button" class="btn btn-danger remove-prize-btn">刪除</button>
    </div>
  `;

  wrap.querySelector(".remove-prize-btn").addEventListener("click", () => {
    wrap.remove();
    updatePrizeSummary();
  });

  wrap.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", updatePrizeSummary);
  });

  return wrap;
}

function clearPrizeRows() {
  els.prizeRows.innerHTML = "";
}

function renderPrizeRows(prizes = []) {
  clearPrizeRows();
  if (!prizes.length) {
    els.prizeRows.appendChild(newPrizeRow());
  } else {
    prizes.forEach((prize) => els.prizeRows.appendChild(newPrizeRow(prize)));
  }
  updatePrizeSummary();
}

function updatePrizeSummary() {
  const rows = Array.from(els.prizeRows.querySelectorAll(".prize-row"));
  const totalTickets = Number(els.totalTickets.value || 0);
  const totalPrizeCount = rows.reduce((sum, row) => {
    const q = Number(row.querySelector(".prize-quantity")?.value || 0);
    return sum + (Number.isFinite(q) ? q : 0);
  }, 0);

  els.prizeSummary.textContent = `獎項總數目前 ${totalPrizeCount}，總籤數 ${totalTickets || 0}。兩者必須相等。`;
  els.prizeSummary.className = totalPrizeCount === totalTickets && totalTickets > 0
    ? "prize-summary ok"
    : "prize-summary";
}

function getPrizePayload() {
  const rows = Array.from(els.prizeRows.querySelectorAll(".prize-row"));
  return rows.map((row) => ({
    prize_code: row.querySelector(".prize-code")?.value?.trim() || "",
    prize_name: row.querySelector(".prize-name")?.value?.trim() || "",
    total_quantity: Number(row.querySelector(".prize-quantity")?.value || 0),
    display_order: Number(row.querySelector(".prize-order")?.value || 0),
    prize_image_url: row.querySelector(".prize-image-url")?.value?.trim() || null,
  }));
}

function validateCampaignForm() {
  const title = els.campaignTitle.value.trim();
  const pointsPerDraw = Number(els.pointsPerDraw.value || 0);
  const totalTickets = Number(els.totalTickets.value || 0);
  const maxDrawPerOrder = Number(els.maxDrawPerOrder.value || 0);
  const turnHoldSeconds = Number(els.turnHoldSeconds.value || 0);
  const prizes = getPrizePayload();

  if (!title) throw new Error("請輸入活動名稱");
  if (!Number.isInteger(pointsPerDraw) || pointsPerDraw <= 0) throw new Error("每抽點數必須是大於 0 的整數");
  if (!Number.isInteger(totalTickets) || totalTickets <= 0) throw new Error("總籤數必須是大於 0 的整數");
  if (!Number.isInteger(maxDrawPerOrder) || maxDrawPerOrder <= 0) throw new Error("單次最多抽數必須是大於 0 的整數");
  if (!Number.isInteger(turnHoldSeconds) || turnHoldSeconds <= 0) throw new Error("保留秒數必須是大於 0 的整數");

  if (!prizes.length) throw new Error("請至少新增一個獎項");

  for (const [index, prize] of prizes.entries()) {
    if (!prize.prize_code) throw new Error(`第 ${index + 1} 個獎項缺少代號`);
    if (!prize.prize_name) throw new Error(`第 ${index + 1} 個獎項缺少名稱`);
    if (!Number.isInteger(prize.total_quantity) || prize.total_quantity <= 0) {
      throw new Error(`第 ${index + 1} 個獎項數量必須是大於 0 的整數`);
    }
    if (!Number.isInteger(prize.display_order) || prize.display_order < 0) {
      throw new Error(`第 ${index + 1} 個獎項排序必須是 0 或正整數`);
    }
  }

  const totalPrizeCount = prizes.reduce((sum, prize) => sum + prize.total_quantity, 0);
  if (totalPrizeCount !== totalTickets) {
    throw new Error(`獎項總數 ${totalPrizeCount} 必須等於總籤數 ${totalTickets}`);
  }

  return {
    campaignId: els.campaignId.value ? Number(els.campaignId.value) : null,
    title,
    description: els.description.value.trim() || null,
    coverImageUrl: els.coverImageUrl.value.trim() || null,
    pointsPerDraw,
    totalTickets,
    maxDrawPerOrder,
    turnHoldSeconds,
    startsAt: els.startsAt.value ? new Date(els.startsAt.value).toISOString() : null,
    endsAt: els.endsAt.value ? new Date(els.endsAt.value).toISOString() : null,
    prizes,
  };
}

function resetCampaignForm() {
  state.selectedCampaignId = null;
  setCampaignStatusBadge("draft");

  els.formTitle.textContent = "新增草稿";
  els.campaignId.value = "";
  els.campaignTitle.value = "";
  els.pointsPerDraw.value = "5";
  els.totalTickets.value = "10";
  els.maxDrawPerOrder.value = "1";
  els.turnHoldSeconds.value = "30";
  els.coverImageUrl.value = "";
  els.startsAt.value = "";
  els.endsAt.value = "";
  els.description.value = "";

  renderPrizeRows([
    { prize_code: "A", prize_name: "A賞", total_quantity: 1, display_order: 1, prize_image_url: "" },
    { prize_code: "B", prize_name: "B賞", total_quantity: 1, display_order: 2, prize_image_url: "" },
    { prize_code: "C", prize_name: "C賞", total_quantity: 8, display_order: 3, prize_image_url: "" },
  ]);

  renderOrderList([]);
  updateActionButtons();
}

function updateActionButtons() {
  const status = state.selectedCampaignStatus || "draft";
  const hasCampaign = !!state.selectedCampaignId;

  els.publishBtn.disabled = !hasCampaign || status !== "draft";
  els.pauseBtn.disabled = !hasCampaign || status !== "active";
  els.resumeBtn.disabled = !hasCampaign || status !== "paused";
  els.endBtn.disabled = !hasCampaign || status === "ended";
}

function renderCampaignList() {
  if (!state.campaigns.length) {
    els.campaignList.innerHTML = '<div class="empty-state">目前沒有活動</div>';
    return;
  }

  els.campaignList.innerHTML = state.campaigns.map((campaign) => `
    <button type="button" class="campaign-item ${Number(state.selectedCampaignId) === Number(campaign.id) ? "active" : ""}" data-campaign-id="${escapeHtml(campaign.id)}">
      <div class="campaign-item-title">${escapeHtml(campaign.title || `活動 #${campaign.id}`)}</div>
      <div class="campaign-item-sub">${escapeHtml(getStatusLabel(campaign.status))} ・ 剩餘 ${escapeHtml(campaign.remaining_tickets ?? 0)}</div>
    </button>
  `).join("");

  els.campaignList.querySelectorAll(".campaign-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      loadCampaignDetail(Number(btn.dataset.campaignId));
    });
  });
}

function renderOrderList(orders) {
  if (!orders?.length) {
    els.orderList.innerHTML = '<div class="empty-state">目前沒有抽獎紀錄</div>';
    return;
  }

  els.orderList.innerHTML = orders.map((order) => {
    const resultList = Array.isArray(order.results) ? order.results : [];
    const resultText = resultList.length
      ? resultList.map((r) => `${r.prize_code || ""} ${r.prize_name || ""}（#${r.ticket_no || "-"}）`).join("、")
      : "無結果資料";

    return `
      <div class="order-item">
        <div class="order-item-main">
          <div class="order-item-title">${escapeHtml(order.member_nickname || "未知會員")}</div>
          <div class="order-item-sub">
            ${escapeHtml(formatDateTimeText(order.created_at))} ・ 抽 ${escapeHtml(order.draw_count)} 張 ・ 扣 ${escapeHtml(order.points_spent)} 點
          </div>
          <div class="order-item-result">${escapeHtml(resultText)}</div>
        </div>
      </div>
    `;
  }).join("");
}

async function loadDashboard() {
  const data = await callApi("login");
  state.me = data.member || null;
  ensureAdmin();
  renderAdmin(data);
}

async function loadCampaigns() {
  const data = await callApi("admin_list_kuji_campaigns");
  state.campaigns = data.campaigns || [];
  renderCampaignList();
}

async function loadCampaignDetail(campaignId) {
  const data = await callApi("admin_get_kuji_campaign_detail", { campaignId });
  const campaign = data.campaign || data.campaigns || data?.detail?.campaign || null;
  const prizes = data.prizes || [];
  if (!campaign) throw new Error("讀取活動失敗");

  state.selectedCampaignId = Number(campaign.id);
  els.formTitle.textContent = "編輯活動";
  els.campaignId.value = String(campaign.id);
  els.campaignTitle.value = campaign.title || "";
  els.pointsPerDraw.value = String(campaign.points_per_draw ?? "");
  els.totalTickets.value = String(campaign.total_tickets ?? "");
  els.maxDrawPerOrder.value = String(campaign.max_draw_per_order ?? "");
  els.turnHoldSeconds.value = String(campaign.turn_hold_seconds ?? "");
  els.coverImageUrl.value = campaign.cover_image_url || "";
  els.startsAt.value = formatDateTimeInput(campaign.starts_at);
  els.endsAt.value = formatDateTimeInput(campaign.ends_at);
  els.description.value = campaign.description || "";

  setCampaignStatusBadge(campaign.status || "draft");
  renderPrizeRows(prizes);

  const orders = await callApi("admin_get_kuji_orders", { campaignId });
  renderOrderList(orders.orders || []);
  renderCampaignList();
  updateActionButtons();
}

async function searchMembers() {
  const key = "searchMembers";
  try {
    startPending(key);
    clearMessage();
    const keyword = els.memberKeyword.value.trim();
    const data = await callApi("search_members", { keyword });
    renderMemberSearchResults(data.members || []);
    showMessage(`找到 ${data.members?.length || 0} 位會員`);
  } catch (error) {
    showMessage(normalizeError(error, "搜尋會員失敗"), true);
  } finally {
    endPending(key);
  }
}

async function grantPoints() {
  const key = "grantPoints";
  try {
    startPending(key);
    clearMessage();

    if (!state.selectedMember) throw new Error("請先選取會員");
    const points = Number(els.pointAmount.value || 0);
    const reason = els.pointReason.value.trim();

    if (!Number.isInteger(points) || points <= 0) throw new Error("點數必須是大於 0 的整數");
    if (!reason) throw new Error("請填寫原因");

    await callApi("grant_points", {
      memberId: state.selectedMember.id,
      points,
      reason,
      requestId: makeRequestId("grant"),
    });

    showMessage("加點成功");
    els.pointAmount.value = "";
    els.pointReason.value = "";
    await searchMembers();
    if (state.selectedMember?.id) {
      const latest = (await callApi("search_members", { keyword: state.selectedMember.nickname || state.selectedMember.display_name || "" })).members || [];
      const found = latest.find((m) => String(m.id) === String(state.selectedMember.id));
      if (found) {
        state.selectedMember = found;
        renderSelectedMember();
      }
    }
  } catch (error) {
    showMessage(normalizeError(error, "加點失敗"), true);
  } finally {
    endPending(key);
  }
}

async function deductPoints() {
  const key = "deductPoints";
  try {
    startPending(key);
    clearMessage();

    if (!state.selectedMember) throw new Error("請先選取會員");
    const points = Number(els.pointAmount.value || 0);
    const reason = els.pointReason.value.trim();

    if (!Number.isInteger(points) || points <= 0) throw new Error("點數必須是大於 0 的整數");
    if (!reason) throw new Error("請填寫原因");

    await callApi("deduct_points", {
      memberId: state.selectedMember.id,
      points,
      reason,
      requestId: makeRequestId("deduct"),
    });

    showMessage("扣點成功");
    els.pointAmount.value = "";
    els.pointReason.value = "";
    await searchMembers();
    if (state.selectedMember?.id) {
      const latest = (await callApi("search_members", { keyword: state.selectedMember.nickname || state.selectedMember.display_name || "" })).members || [];
      const found = latest.find((m) => String(m.id) === String(state.selectedMember.id));
      if (found) {
        state.selectedMember = found;
        renderSelectedMember();
      }
    }
  } catch (error) {
    showMessage(normalizeError(error, "扣點失敗"), true);
  } finally {
    endPending(key);
  }
}

async function saveDraft() {
  const key = "saveDraft";
  try {
    startPending(key);
    clearMessage();
    const payload = validateCampaignForm();

    const data = await callApi("admin_save_kuji_campaign", payload);
    showMessage(data.message || "草稿已儲存");

    if (data.campaignId) {
      state.selectedCampaignId = Number(data.campaignId);
    }

    await loadCampaigns();
    if (state.selectedCampaignId) {
      await loadCampaignDetail(state.selectedCampaignId);
    }
  } catch (error) {
    showMessage(normalizeError(error, "儲存草稿失敗"), true);
  } finally {
    endPending(key);
  }
}

async function publishCampaign() {
  const key = "publishCampaign";
  try {
    startPending(key);
    clearMessage();

    if (!state.selectedCampaignId) throw new Error("請先儲存草稿");
    const data = await callApi("admin_publish_kuji_campaign", {
      campaignId: state.selectedCampaignId,
    });

    showMessage(data.message || "活動已上架");
    await loadCampaigns();
    await loadCampaignDetail(state.selectedCampaignId);
  } catch (error) {
    showMessage(normalizeError(error, "上架活動失敗"), true);
  } finally {
    endPending(key);
  }
}

async function changeCampaignStatus(status) {
  const key = `changeCampaignStatus:${status}`;
  try {
    startPending(key);
    clearMessage();

    if (!state.selectedCampaignId) throw new Error("請先選擇活動");

    const data = await callApi("admin_change_kuji_campaign_status", {
      campaignId: state.selectedCampaignId,
      status,
    });

    showMessage(data.message || "活動狀態已更新");
    await loadCampaigns();
    await loadCampaignDetail(state.selectedCampaignId);
  } catch (error) {
    showMessage(normalizeError(error, "更新活動狀態失敗"), true);
  } finally {
    endPending(key);
  }
}

async function signIn() {
  if (!window.liff?.isLoggedIn()) {
    window.liff.login({ redirectUri: getCleanAppUrl() });
    return;
  }
  await bootstrap();
}

async function signOut() {
  if (window.liff && liff.isLoggedIn()) {
    liff.logout();
  }
  state.accessToken = null;
  state.me = null;
  state.campaigns = [];
  renderLoggedOut();
  showMessage("已登出");
}

async function bootstrap() {
  try {
    const config = getConfig();
    if (!config.liffId || !config.supabaseUrl || !config.supabaseAnonKey || !config.apiFunctionName) {
      throw new Error("請先設定 config.js");
    }

    await liff.init({
      liffId: config.liffId,
      withLoginOnExternalBrowser: false,
    });

    if (!liff.isLoggedIn()) {
      renderLoggedOut();
      return;
    }

    state.accessToken = liff.getAccessToken();
    const dashboard = await callApi("login");
    state.me = dashboard.member || null;
    ensureAdmin();
    renderAdmin(dashboard);

    resetSelectedMember();
    resetCampaignForm();
    await loadCampaigns();
  } catch (error) {
    renderLoggedOut();
    showMessage(normalizeError(error, "初始化失敗"), true);
  }
}

els.loginBtn?.addEventListener("click", signIn);
els.logoutBtn?.addEventListener("click", signOut);

els.searchMembersBtn?.addEventListener("click", searchMembers);
els.grantPointsBtn?.addEventListener("click", grantPoints);
els.deductPointsBtn?.addEventListener("click", deductPoints);

els.newDraftBtn?.addEventListener("click", () => {
  clearMessage();
  resetCampaignForm();
  renderCampaignList();
});

els.refreshCampaignsBtn?.addEventListener("click", async () => {
  try {
    clearMessage();
    await loadCampaigns();
    showMessage("活動列表已更新");
  } catch (error) {
    showMessage(normalizeError(error, "刷新活動列表失敗"), true);
  }
});

els.addPrizeRowBtn?.addEventListener("click", () => {
  els.prizeRows.appendChild(newPrizeRow());
  updatePrizeSummary();
});

els.totalTickets?.addEventListener("input", updatePrizeSummary);

els.saveDraftBtn?.addEventListener("click", saveDraft);
els.publishBtn?.addEventListener("click", publishCampaign);
els.pauseBtn?.addEventListener("click", () => changeCampaignStatus("paused"));
els.resumeBtn?.addEventListener("click", () => changeCampaignStatus("active"));
els.endBtn?.addEventListener("click", () => changeCampaignStatus("ended"));

bootstrap();
