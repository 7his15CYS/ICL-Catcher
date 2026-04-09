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
  turnTimerId: null,
  pollTimerId: null,
  localTurn: null,
  lastTurnStatusText: '',
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
  turnPanel: document.getElementById('turn-panel'),
  turnStatusTitle: document.getElementById('turn-status-title'),
  turnStatusText: document.getElementById('turn-status-text'),
  turnCountdown: document.getElementById('turn-countdown'),
  releaseTurnBtn: document.getElementById('release-turn-btn'),
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
function stopTurnTimer(){ if(state.turnTimerId){ clearInterval(state.turnTimerId); state.turnTimerId=null; } }
function stopPollTimer(){ if(state.pollTimerId){ clearInterval(state.pollTimerId); state.pollTimerId=null; } }
function clearTurnState(){ stopTurnTimer(); state.localTurn=null; }
function getLocalTurn(){
  const turn = state.localTurn;
  if(!turn) return null;
  const expiresAt = turn.holder_expires_at ? new Date(turn.holder_expires_at).getTime() : 0;
  const expired = !expiresAt || expiresAt <= Date.now();
  const myId = state.member?.id ? String(state.member.id) : null;
  const holderId = turn.holder_member_id ? String(turn.holder_member_id) : null;
  return {
    holder_member_id: holderId,
    holder_nickname: turn.holder_nickname || null,
    holder_expires_at: turn.holder_expires_at || null,
    my_turn: Boolean(myId && holderId && myId === holderId && !expired),
    occupied_by_other: Boolean(myId && holderId && myId !== holderId && !expired),
    can_claim: !holderId || expired || (myId && holderId === myId),
    is_expired: expired,
    remaining_ms: expired ? 0 : Math.max(0, expiresAt - Date.now()),
  };
}
function applyTurnFromDetail(detail){
  const turn = detail?.turn || null;
  const campaign = detail?.campaign || null;
  if(!turn || !campaign){
    state.localTurn = null;
    return;
  }
  state.localTurn = {
    holder_member_id: turn.holder_member_id ?? campaign.active_holder_member_id ?? null,
    holder_nickname: turn.holder_nickname ?? null,
    holder_expires_at: turn.holder_expires_at ?? campaign.active_holder_expires_at ?? null,
  };
}
function applyTurnFromRevealResult(result){
  const memberId = result?.holder_member_id ?? state.member?.id ?? null;
  const currentNick = state.member?.nickname || state.member?.display_name || null;
  state.localTurn = {
    holder_member_id: memberId,
    holder_nickname: currentNick,
    holder_expires_at: result?.holder_expires_at || null,
  };
}
function startTurnTimer(){
  stopTurnTimer();
  state.turnTimerId = window.setInterval(() => {
    renderTurnPanel();
    const turn = getLocalTurn();
    if(!turn || turn.is_expired){
      stopTurnTimer();
      refreshCurrentCampaignState({ silent: true }).catch(() => {});
    }
  }, 1000);
}
function ensurePollTimer(){
  stopPollTimer();
  state.pollTimerId = window.setInterval(() => {
    if(state.currentCampaignId && canAccessKuji(state.member) && !state.revealingTicketNo){
      refreshCurrentCampaignState({ silent: true }).catch(() => {});
    }
  }, 5000);
}
function renderTurnPanel(){
  if(!els.turnPanel) return;
  const turn = getLocalTurn();
  let panelClass = 'turn-panel waiting';
  let title = '尚未鎖定回合';
  let text = '點任何一張籤紙後，系統才會開始為你保留回合。';
  let countdownText = '--';
  let showRelease = false;

  if(turn?.my_turn){
    const seconds = Math.ceil(turn.remaining_ms / 1000);
    panelClass = 'turn-panel mine';
    title = '目前由你操作';
    text = `你已取得回合保留時間。再次翻開下一張後，倒數會重新回到完整秒數。`;
    countdownText = `${Math.max(0, seconds)} 秒`;
    showRelease = true;
  } else if(turn?.occupied_by_other){
    const seconds = Math.ceil(turn.remaining_ms / 1000);
    const holderName = turn.holder_nickname ? `會員 ${turn.holder_nickname}` : '其他會員';
    panelClass = 'turn-panel locked';
    title = '目前有人抽獎中';
    text = `${holderName} 正在操作，請等待倒數結束或對方主動釋放回合。`;
    countdownText = `${Math.max(0, seconds)} 秒`;
  } else if(turn?.is_expired){
    panelClass = 'turn-panel waiting';
    title = '回合已釋放';
    text = '上一位會員的保留時間已結束，現在任何人都可以點選籤紙。';
    countdownText = '可點選';
  }

  els.turnPanel.className = panelClass;
  els.turnStatusTitle.textContent = title;
  els.turnStatusText.textContent = text;
  els.turnCountdown.textContent = countdownText;
  els.releaseTurnBtn.style.display = showRelease ? 'inline-flex' : 'none';
}
function canInteractTicket(ticket){
  const turn = getLocalTurn();
  const isBusy = state.revealingTicketNo === Number(ticket.ticket_no);
  if(ticket.is_revealed || isBusy) return false;
  if(!turn) return true;
  if(turn.occupied_by_other) return false;
  return true;
}

function renderMember(member, points){
  if(!member){
    els.memberSection.style.display='none';
    els.loginBtn.style.display='inline-flex';
    els.logoutBtn.style.display='none';
    clearTurnState();
    stopPollTimer();
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
    ensurePollTimer();
  }else{
    clearTurnState();
    stopPollTimer();
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
        const drawn = Math.max(0, total - remaining);
        const ratio = total > 0 ? Math.max(0, Math.min(100, Math.round((drawn / total) * 100))) : 0;
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
                <span>已抽 ${drawn} / 共 ${total}</span>
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
  const turn = getLocalTurn();

  let summary = totalCount
    ? `共 ${totalCount} 張籤紙，已翻開 ${revealedCount} 張，中獎 ${winningCount} 張。`
    : '目前沒有可顯示的籤紙。';
  if(turn?.occupied_by_other){
    summary += ' 目前由其他會員操作中。';
  } else if(turn?.my_turn){
    summary += ' 你目前持有操作回合。';
  }
  els.ticketWallSummary.textContent = summary;

  if(!totalCount){
    els.ticketGrid.innerHTML = '<div class="empty-state">目前沒有可顯示的籤紙</div>';
    return;
  }

  els.ticketGrid.innerHTML = tickets.map(ticket => {
    const isBusy = state.revealingTicketNo === Number(ticket.ticket_no);
    const classes = ['ticket-tile', 'direct-ticket-tile'];
    if(ticket.is_revealed) classes.push(ticket.is_winning ? 'revealed-win' : 'revealed-miss');
    if(isBusy) classes.push('is-loading');
    if(!canInteractTicket(ticket)) classes.push('blocked');
    return `<button class="${classes.join(' ')}" data-ticket-no="${escapeHtml(ticket.ticket_no)}" type="button" ${canInteractTicket(ticket) ? '' : 'disabled'}>${buildTicketInner(ticket)}</button>`;
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
    clearTurnState();
    renderTurnPanel();
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
  renderTurnPanel();
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
  const data = await callApi('get_kuji_ticket_wall', {
    campaignId: state.currentCampaignId,
    accessToken: state.accessToken,
  }, true);
  state.ticketWall = data.tickets || [];
  if(state.currentDetail?.campaign && data.campaign){
    state.currentDetail.campaign = {
      ...state.currentDetail.campaign,
      ...data.campaign,
    };
  }
  renderTicketWall();
}

async function refreshCurrentCampaignState({ silent=false } = {}){
  if(!state.currentCampaignId || !canAccessKuji(state.member)) return;
  const [detail, wall] = await Promise.all([
    callApi('get_kuji_campaign_detail', {
      campaignId: state.currentCampaignId,
      accessToken: state.accessToken,
    }, true),
    callApi('get_kuji_ticket_wall', {
      campaignId: state.currentCampaignId,
      accessToken: state.accessToken,
    }, true),
  ]);
  state.currentDetail = detail;
  applyTurnFromDetail(detail);
  state.ticketWall = wall.tickets || [];
  if(detail?.campaign && wall?.campaign){
    state.currentDetail.campaign = {
      ...detail.campaign,
      ...wall.campaign,
    };
  }
  if(getLocalTurn()?.holder_expires_at) startTurnTimer(); else stopTurnTimer();
  renderCurrentCampaign();
  if(!silent) clearMessage();
}

async function openCampaign(campaignId, silent=false){
  if(!canAccessKuji(state.member)){
    setKujiVisibility(false, '你的帳號目前是一般會員，無法查看一番賞活動。請先由管理員將你設定為 VIP 會員。');
    return;
  }
  state.currentCampaignId = campaignId;
  const detail = await callApi('get_kuji_campaign_detail', {
    campaignId,
    accessToken: state.accessToken,
  }, true);
  
  const wall = await callApi('get_kuji_ticket_wall', {
    campaignId,
    accessToken: state.accessToken,
  }, true);
  state.currentDetail = detail;
  applyTurnFromDetail(detail);
  state.ticketWall = wall.tickets || [];
  if(detail?.campaign && wall?.campaign) {
    detail.campaign = {
      ...detail.campaign,
      ...wall.campaign,
    };
  }
  if(getLocalTurn()?.holder_expires_at) startTurnTimer(); else stopTurnTimer();
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
  const currentTurn = getLocalTurn();
  if(currentTurn?.occupied_by_other){
    showMessage('目前由其他會員持有回合，請稍候再試。', true);
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
    applyTurnFromRevealResult(result);
    if(getLocalTurn()?.holder_expires_at) startTurnTimer();
    if(result.points != null && state.member){
      state.member.current_points = result.points;
      renderMember(state.member, result.points);
    } else {
      await loadDashboard();
    }
    await refreshCurrentCampaignState({ silent: true });
    showMessage(result.message || '已翻開籤紙');
  }catch(error){
    showMessage(normalizeError(error, '翻開籤紙失敗'), true);
    await refreshCurrentCampaignState({ silent: true }).catch(() => {});
  }finally{
    state.revealingTicketNo = null;
    renderTicketWall();
  }
}

async function releaseCurrentTurn(){
  if(!state.currentCampaignId || !state.member?.id) return;
  const turn = getLocalTurn();
  if(!turn?.my_turn) return;
  try{
    setButtonLoading(els.releaseTurnBtn, true, '釋放中...');
    clearMessage();
    const result = await callApi('release_kuji_turn', { campaignId: state.currentCampaignId }, true);
    clearTurnState();
    await refreshCurrentCampaignState({ silent: true });
    showMessage(result.message || '已釋放抽籤控制權');
  }catch(error){
    showMessage(normalizeError(error, '釋放回合失敗'), true);
  }finally{
    setButtonLoading(els.releaseTurnBtn, false);
  }
}

async function signIn(){ if(!liff.isLoggedIn()){ liff.login({redirectUri:getCleanAppUrl()}); return; } await bootstrap(); }
async function signOut(){ if(window.liff && liff.isLoggedIn()) liff.logout(); stopPollTimer(); clearTurnState(); state.accessToken=null; state.member=null; state.campaigns=[]; state.currentCampaignId=null; state.currentDetail=null; state.ticketWall=[]; renderMember(null); els.campaignList.innerHTML=''; renderCurrentCampaign(); showMessage('已登出'); }

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
els.refreshWallBtn?.addEventListener('click', ()=>refreshCurrentCampaignState({ silent: true }).catch(e=>showMessage(normalizeError(e,'刷新籤紙失敗'),true)));
els.releaseTurnBtn?.addEventListener('click', ()=>releaseCurrentTurn());
bootstrap();
