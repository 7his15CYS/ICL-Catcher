function getConfig() { return window.APP_CONFIG || {}; }
const qs = new URLSearchParams(window.location.search);
const state = {
  accessToken: null,
  member: null,
  campaigns: [],
  currentCampaignId: qs.get('campaignId') ? Number(qs.get('campaignId')) : null,
  currentDetail: null,
  ticketWall: [],
  revealingTicketNo: null,
};
const els = {
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  messageBox: document.getElementById('message-box'),
  memberSection: document.getElementById('member-section'),
  memberAvatar: document.getElementById('member-avatar'),
  memberName: document.getElementById('member-name'),
  memberPoints: document.getElementById('member-points'),
  accessDeniedSection: document.getElementById('access-denied-section'),
  accessDeniedText: document.getElementById('access-denied-text'),
  kujiContent: document.getElementById('kuji-content'),
  campaignList: document.getElementById('campaign-list'),
  campaignEmpty: document.getElementById('campaign-empty'),
  campaignDetail: document.getElementById('campaign-detail'),
  campaignTitle: document.getElementById('campaign-title'),
  campaignStatusBadge: document.getElementById('campaign-status-badge'),
  campaignImage: document.getElementById('campaign-image'),
  campaignDescription: document.getElementById('campaign-description'),
  campaignStats: document.getElementById('campaign-stats'),
  prizeList: document.getElementById('prize-list'),
  refreshCampaignsBtn: document.getElementById('refresh-campaigns-btn'),
  refreshWallBtn: document.getElementById('refresh-wall-btn'),
  ticketWallSummary: document.getElementById('ticket-wall-summary'),
  ticketGrid: document.getElementById('ticket-grid'),
};

function escapeHtml(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function normalizeError(err, fallback='發生錯誤') { if (err==null) return fallback; if (typeof err==='string') return err; if (err instanceof Error) return err.message||fallback; if (typeof err==='object') return err.message||err.error||fallback; return String(err); }
function showMessage(message, isError=false) { const text=normalizeError(message,''); if(!text){ els.messageBox.style.display='none'; return; } els.messageBox.textContent=text; els.messageBox.style.display='block'; els.messageBox.className=isError ? 'message error' : 'message success'; }
function clearMessage(){ showMessage(''); }
function setButtonLoading(button, loading, label='處理中...'){ if(!button) return; if(!button.dataset.originalText) button.dataset.originalText=button.textContent||''; button.disabled=loading; button.textContent=loading ? label : button.dataset.originalText; }
function makeRequestId(prefix){ return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`; }
function getCleanAppUrl(){ return `${window.location.origin}${window.location.pathname}${window.location.search}`; }
async function callApi(action,payload={},includeToken=true){ const c=getConfig(); const body={action,...payload}; if(includeToken && state.accessToken) body.accessToken=state.accessToken; const res=await fetch(`${c.supabaseUrl}/functions/v1/${c.apiFunctionName}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:c.supabaseAnonKey},body:JSON.stringify(body)}); const text=await res.text(); let data={}; try{ data=text?JSON.parse(text):{}; }catch{ data={message:text}; } if(!res.ok||data.ok===false) throw data; return data; }
function formatTicketNo(v){ return String(v ?? '').padStart(3,'0'); }
function getMemberRole(member){ return String(member?.member_role || '').toLowerCase(); }
function canAccessKuji(member){ return Boolean(member && (member.is_admin || getMemberRole(member) === 'vip')); }
function setKujiVisibility(allowed, message=''){
  els.kujiContent.style.display = allowed ? 'grid' : 'none';
  els.accessDeniedSection.style.display = allowed ? 'none' : 'block';
  if(!allowed && els.accessDeniedText){
    els.accessDeniedText.textContent = message || '此頁面僅限 VIP 會員與管理員查看。';
  }
}

function renderMember(member, points){
  if(!member){
    els.memberSection.style.display='none';
    els.loginBtn.style.display='inline-flex';
    els.logoutBtn.style.display='none';
    setKujiVisibility(false, '請先使用 LINE 登入，且帳號需為 VIP 會員或管理員，才能查看一番賞活動。');
    return;
  }
  els.memberSection.style.display='block';
  els.loginBtn.style.display='none';
  els.logoutBtn.style.display='inline-flex';
  els.memberName.textContent=member.nickname||member.display_name||'LINE 會員';
  els.memberAvatar.src=member.avatar_url||'https://placehold.co/96x96?text=User';
  els.memberPoints.textContent=String(points ?? member.current_points ?? 0);
  if(canAccessKuji(member)){
    setKujiVisibility(true);
  }else{
    setKujiVisibility(false, '你的帳號目前是一般會員，無法查看一番賞活動。請先由管理員將你設定為 VIP 會員。');
  }
}

function renderCampaignList(){
  if(!state.campaigns.length){
    els.campaignList.innerHTML='<div class="empty-state">目前沒有上架中的一番賞活動</div>';
    return;
  }
  els.campaignList.innerHTML=state.campaigns.map(c=>`<button class="campaign-row ${state.currentCampaignId===Number(c.id)?'active':''}" data-id="${c.id}" type="button"><div class="campaign-row-title">${escapeHtml(c.title)}</div><div class="campaign-row-sub">${Number(c.points_per_draw||0)} 點 / 張 ・ 剩餘 ${Number(c.remaining_tickets||0)} 張</div></button>`).join('');
  els.campaignList.querySelectorAll('.campaign-row').forEach(btn=>btn.addEventListener('click',()=>openCampaign(Number(btn.dataset.id))));
}

function renderPrizeList(prizes){
  const list = Array.isArray(prizes) ? prizes : [];
  els.prizeList.innerHTML = list.length
    ? list.map((p) => {
        const remaining = Number(p.remaining_quantity || 0);
        const total = Number(p.total_quantity || 0);
        const ratio = total > 0 ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100))) : 0;
        const isSoldOut = total > 0 && remaining <= 0;
        const title = escapeHtml(p.prize_name || '未命名獎項');
        const code = escapeHtml(p.prize_code || '獎項');
        const sameText = String(p.prize_code || '').trim() === String(p.prize_name || '').trim();
        return `
          <article class="prize-card ${isSoldOut ? 'sold-out' : ''}">
            <div class="prize-card-media">
              <img class="prize-image" src="${escapeHtml(p.prize_image_url || 'https://placehold.co/640x360?text=Prize')}" alt="${title}">
              <span class="prize-stock-badge ${isSoldOut ? 'sold-out' : 'available'}">${isSoldOut ? '已抽完' : `剩餘 ${remaining}`}</span>
            </div>
            <div class="prize-body">
              <div class="prize-title-row">
                <div>
                  <div class="prize-code">${code}</div>
                  <h4>${sameText ? code : title}</h4>
                </div>
                <div class="prize-count">${remaining}<span>/ ${total}</span></div>
              </div>
              ${sameText ? '' : `<div class="prize-subtitle">${title}</div>`}
              <div class="prize-progress" aria-hidden="true"><span style="width:${ratio}%"></span></div>
              <div class="prize-meta">
                <span>剩餘 ${remaining} / 共 ${total}</span>
                <span>${ratio}%</span>
              </div>
            </div>
          </article>`;
      }).join('')
    : '<div class="empty-state">尚未設定獎項</div>';
}

function buildTicketInner(ticket){
  const ticketNo = formatTicketNo(ticket.ticket_no);
  if(!ticket.is_revealed){
    return `<span class="ticket-label">${ticketNo}</span>`;
  }
  if(ticket.is_winning){
    return `<span class="ticket-no">${ticketNo}</span><span class="ticket-result"><strong>${escapeHtml(ticket.prize_code || '')}</strong><br>${escapeHtml(ticket.prize_name || '')}</span>`;
  }
  return `<span class="ticket-no">${ticketNo}</span><span class="ticket-result">未中獎</span>`;
}

function renderTicketWall(){
  const tickets = Array.isArray(state.ticketWall) ? state.ticketWall : [];
  const revealedCount = tickets.filter(t => t.is_revealed).length;
  const totalCount = tickets.length;
  const winningCount = tickets.filter(t => t.is_revealed && t.is_winning).length;

  els.ticketWallSummary.textContent = totalCount
    ? `共 ${totalCount} 張籤紙，已翻開 ${revealedCount} 張，中獎 ${winningCount} 張。`
    : '目前沒有可顯示的籤紙。';

  if(!totalCount){
    els.ticketGrid.innerHTML = '<div class="empty-state">目前沒有可顯示的籤紙</div>';
    return;
  }

  els.ticketGrid.innerHTML = tickets.map(ticket => {
    const isBusy = state.revealingTicketNo === Number(ticket.ticket_no);
    const classes = ['ticket-tile', 'direct-ticket-tile'];
    if(ticket.is_revealed) classes.push(ticket.is_winning ? 'revealed-win' : 'revealed-miss');
    if(isBusy) classes.push('is-loading');
    return `<button class="${classes.join(' ')}" data-ticket-no="${escapeHtml(ticket.ticket_no)}" type="button" ${ticket.is_revealed || isBusy ? 'disabled' : ''}>${buildTicketInner(ticket)}</button>`;
  }).join('');

  els.ticketGrid.querySelectorAll('[data-ticket-no]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ticketNo = Number(btn.dataset.ticketNo);
      if (!Number.isInteger(ticketNo)) return;
      await revealTicket(ticketNo);
    });
  });
}

function renderCurrentCampaign(){
  const detail = state.currentDetail;
  if(!detail){
    els.campaignEmpty.style.display='block';
    els.campaignDetail.style.display='none';
    return;
  }

  const campaign=detail.campaign||{};
  els.campaignEmpty.style.display='none';
  els.campaignDetail.style.display='block';
  els.campaignTitle.textContent=campaign.title||'-';
  els.campaignImage.src=campaign.cover_image_url||'https://placehold.co/1200x600?text=KUJI';
  els.campaignDescription.textContent=campaign.description||'暫無活動說明';
  els.campaignStatusBadge.textContent=campaign.status||'-';
  els.campaignStatusBadge.className=`status-chip ${campaign.status==='active'?'busy':'idle'}`;
  els.campaignStats.innerHTML=`
    <div class="stat-chip">每抽 ${Number(campaign.points_per_draw||0)} 點</div>
    <div class="stat-chip">總籤數 ${Number(campaign.total_tickets||0)}</div>
    <div class="stat-chip">剩餘 ${Number(campaign.remaining_tickets||0)}</div>
    <div class="stat-chip">已開 ${Number(campaign.total_tickets||0) - Number(campaign.remaining_tickets||0)}</div>`;
  renderPrizeList(detail.prizes || []);
  renderTicketWall();
}

async function loadDashboard(){
  if(!state.accessToken) return false;
  const data = await callApi('login');
  state.member = data.member;
  renderMember(data.member, data.points);
  return canAccessKuji(data.member);
}

async function loadCampaigns(){
  if(!canAccessKuji(state.member)){
    state.campaigns = [];
    state.currentCampaignId = null;
    state.currentDetail = null;
    state.ticketWall = [];
    els.campaignList.innerHTML = '';
    renderCurrentCampaign();
    return;
  }
  const data = await callApi('get_kuji_campaigns', { accessToken: state.accessToken }, true);
  state.campaigns = data.campaigns || [];
  if(state.currentCampaignId && !state.campaigns.some(c=>Number(c.id)===Number(state.currentCampaignId))){
    state.currentCampaignId = state.campaigns[0] ? Number(state.campaigns[0].id) : null;
  }
  if(!state.currentCampaignId && state.campaigns[0]) state.currentCampaignId = Number(state.campaigns[0].id);
  renderCampaignList();
  if(state.currentCampaignId) await openCampaign(state.currentCampaignId, true);
}

async function loadTicketWall(){
  if(!state.currentCampaignId || !canAccessKuji(state.member)) return;
  const data = await callApi('get_kuji_ticket_wall', { campaignId: state.currentCampaignId }, true);
  state.ticketWall = data.tickets || [];
  if(state.currentDetail?.campaign && data.campaign){
    state.currentDetail.campaign = data.campaign;
  }
  renderTicketWall();
}

async function openCampaign(campaignId, silent=false){
  if(!canAccessKuji(state.member)){
    setKujiVisibility(false, '你的帳號目前是一般會員，無法查看一番賞活動。請先由管理員將你設定為 VIP 會員。');
    return;
  }
  state.currentCampaignId = campaignId;
  const detail = await callApi('get_kuji_campaign_detail', { campaignId }, true);
  state.currentDetail = detail;
  const wall = await callApi('get_kuji_ticket_wall', { campaignId }, true);
  state.ticketWall = wall.tickets || [];
  if(detail?.campaign && wall?.campaign) detail.campaign = wall.campaign;
  renderCampaignList();
  renderCurrentCampaign();
  const url = new URL(window.location.href);
  url.searchParams.set('campaignId', String(campaignId));
  window.history.replaceState({}, document.title, url.toString());
  if(!silent) clearMessage();
}

async function revealTicket(ticketNo){
  if(!state.accessToken){
    showMessage('請先使用 LINE 登入後再翻開籤紙', true);
    return;
  }
  if(!canAccessKuji(state.member)){
    showMessage('只有 VIP 會員或管理員可以翻開一番賞籤紙', true);
    return;
  }
  try{
    state.revealingTicketNo = ticketNo;
    renderTicketWall();
    clearMessage();
    const result = await callApi('reveal_kuji_ticket', {
      campaignId: state.currentCampaignId,
      ticketNo,
      requestId: makeRequestId(`kuji-ticket-${ticketNo}`),
    });
    if(result.ticket){
      const idx = state.ticketWall.findIndex(t => Number(t.ticket_no) === Number(ticketNo));
      if(idx >= 0) state.ticketWall[idx] = result.ticket;
    }
    if(result.campaign && state.currentDetail?.campaign) state.currentDetail.campaign = result.campaign;
    if(result.points != null && state.member){
      state.member.current_points = result.points;
      renderMember(state.member, result.points);
    } else {
      await loadDashboard();
    }
    await loadTicketWall();
    renderCurrentCampaign();
    showMessage(result.message || '已翻開籤紙');
  }catch(error){
    showMessage(normalizeError(error, '翻開籤紙失敗'), true);
    await loadTicketWall().catch(() => {});
    renderCurrentCampaign();
  }finally{
    state.revealingTicketNo = null;
    renderTicketWall();
  }
}

async function signIn(){ if(!liff.isLoggedIn()){ liff.login({redirectUri:getCleanAppUrl()}); return; } await bootstrap(); }
async function signOut(){ if(window.liff && liff.isLoggedIn()) liff.logout(); state.accessToken=null; state.member=null; state.campaigns=[]; state.currentCampaignId=null; state.currentDetail=null; state.ticketWall=[]; renderMember(null); els.campaignList.innerHTML=''; renderCurrentCampaign(); showMessage('已登出'); }

async function bootstrap(){
  try{
    const c=getConfig();
    if(!c.liffId||!c.supabaseUrl||!c.supabaseAnonKey||!c.apiFunctionName) throw new Error('請先設定 config.js');
    await liff.init({ liffId:c.liffId, withLoginOnExternalBrowser:false });
    if(liff.isLoggedIn()){
      state.accessToken = liff.getAccessToken();
      const allowed = await loadDashboard();
      if(allowed){
        await loadCampaigns();
      }
    } else {
      renderMember(null);
    }
  }catch(error){
    showMessage(normalizeError(error, '初始化失敗'), true);
  }
}

els.loginBtn?.addEventListener('click', signIn);
els.logoutBtn?.addEventListener('click', signOut);
els.refreshCampaignsBtn?.addEventListener('click', ()=>loadCampaigns().catch(e=>showMessage(normalizeError(e,'刷新活動失敗'),true)));
els.refreshWallBtn?.addEventListener('click', ()=>loadTicketWall().catch(e=>showMessage(normalizeError(e,'刷新籤紙失敗'),true)));
bootstrap();
