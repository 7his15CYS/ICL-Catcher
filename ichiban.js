function getConfig() { return window.APP_CONFIG || {}; }
const qs = new URLSearchParams(window.location.search);
const state = {
  accessToken: null,
  member: null,
  campaigns: [],
  currentCampaignId: qs.get('campaignId') ? Number(qs.get('campaignId')) : null,
  currentDetail: null,
  countdownTimer: null,
  latestDrawResult: null,
  revealedTicketNos: new Set(),
};
const els = {
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  messageBox: document.getElementById('message-box'),
  memberSection: document.getElementById('member-section'),
  memberAvatar: document.getElementById('member-avatar'),
  memberName: document.getElementById('member-name'),
  memberPoints: document.getElementById('member-points'),
  campaignList: document.getElementById('campaign-list'),
  campaignEmpty: document.getElementById('campaign-empty'),
  campaignDetail: document.getElementById('campaign-detail'),
  campaignTitle: document.getElementById('campaign-title'),
  campaignStatusBadge: document.getElementById('campaign-status-badge'),
  campaignImage: document.getElementById('campaign-image'),
  campaignDescription: document.getElementById('campaign-description'),
  campaignStats: document.getElementById('campaign-stats'),
  turnStatusText: document.getElementById('turn-status-text'),
  turnCountdown: document.getElementById('turn-countdown'),
  claimTurnBtn: document.getElementById('claim-turn-btn'),
  releaseTurnBtn: document.getElementById('release-turn-btn'),
  drawCountInput: document.getElementById('draw-count-input'),
  drawBtn: document.getElementById('draw-btn'),
  refreshCampaignsBtn: document.getElementById('refresh-campaigns-btn'),
  refreshDetailBtn: document.getElementById('refresh-detail-btn'),
  prizeList: document.getElementById('prize-list'),
  drawResultBox: document.getElementById('draw-result-box'),
  drawResultSummary: document.getElementById('draw-result-summary'),
  revealAllBtn: document.getElementById('reveal-all-btn'),
};
function escapeHtml(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function normalizeError(err, fallback='發生錯誤') { if (err==null) return fallback; if (typeof err==='string') return err; if (err instanceof Error) return err.message||fallback; if (typeof err==='object') return err.message||err.error||fallback; return String(err); }
function showMessage(message, isError=false) { const text=normalizeError(message,''); if(!text){els.messageBox.style.display='none'; return;} els.messageBox.textContent=text; els.messageBox.style.display='block'; els.messageBox.className=isError?'message error':'message success'; }
function clearMessage(){showMessage('');}
function setButtonLoading(button, loading, label='處理中...'){ if(!button)return; if(!button.dataset.originalText) button.dataset.originalText=button.textContent||''; button.disabled=loading; button.textContent=loading?label:button.dataset.originalText; }
function makeRequestId(prefix){ return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`; }
function getCleanAppUrl(){ return `${window.location.origin}${window.location.pathname}${window.location.search}`; }
async function callApi(action,payload={},includeToken=true){ const c=getConfig(); const body={action,...payload}; if(includeToken&&state.accessToken) body.accessToken=state.accessToken; const res=await fetch(`${c.supabaseUrl}/functions/v1/${c.apiFunctionName}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:c.supabaseAnonKey},body:JSON.stringify(body)}); const text=await res.text(); let data={}; try{data=text?JSON.parse(text):{};}catch{data={message:text};} if(!res.ok||data.ok===false) throw data; return data; }

function renderMember(member, points){ if(!member){ els.memberSection.style.display='none'; els.loginBtn.style.display='inline-flex'; els.logoutBtn.style.display='none'; return; } els.memberSection.style.display='block'; els.loginBtn.style.display='none'; els.logoutBtn.style.display='inline-flex'; els.memberName.textContent=member.nickname||member.display_name||'LINE 會員'; els.memberAvatar.src=member.avatar_url||'https://placehold.co/96x96?text=User'; els.memberPoints.textContent=String(points ?? member.current_points ?? 0); }
function renderCampaignList(){ if(!state.campaigns.length){ els.campaignList.innerHTML='<div class="empty-state">目前沒有上架中的一番賞活動</div>'; return; } els.campaignList.innerHTML=state.campaigns.map(c=>`<button class="campaign-row ${state.currentCampaignId===Number(c.id)?'active':''}" data-id="${c.id}" type="button"><div class="campaign-row-title">${escapeHtml(c.title)}</div><div class="campaign-row-sub">${Number(c.points_per_draw||0)} 點 / 抽 ・ 剩餘 ${Number(c.remaining_tickets||0)}</div></button>`).join(''); els.campaignList.querySelectorAll('.campaign-row').forEach(btn=>btn.addEventListener('click',()=>openCampaign(Number(btn.dataset.id)))); }
function stopCountdown(){ if(state.countdownTimer){ clearInterval(state.countdownTimer); state.countdownTimer=null; } }
function getTurnSecondsLeft(){ const expires = state.currentDetail?.turn?.holder_expires_at; if(!expires) return 0; return Math.max(0, Math.ceil((new Date(expires).getTime()-Date.now())/1000)); }
function updateTurnUi(){ const detail=state.currentDetail; if(!detail) return; const turn=detail.turn||{}; const left=getTurnSecondsLeft(); const mine=Boolean(turn.my_turn && left>0); const occupied=Boolean(turn.occupied_by_other && left>0); if(mine){ els.turnStatusText.textContent='目前是你的抽籤回合，別人不能搶。'; els.turnCountdown.textContent=`剩餘 ${left}s`; els.claimTurnBtn.style.display='none'; els.releaseTurnBtn.style.display='inline-flex'; els.drawBtn.disabled=false; } else if(occupied){ els.turnStatusText.textContent=`目前由 ${turn.holder_nickname || '其他玩家'} 持有抽籤回合。`; els.turnCountdown.textContent=`約 ${left}s 後可重新搶回合`; els.claimTurnBtn.style.display='inline-flex'; els.claimTurnBtn.disabled=true; els.releaseTurnBtn.style.display='none'; els.drawBtn.disabled=true; } else { els.turnStatusText.textContent='目前沒有人持有抽籤回合。'; els.turnCountdown.textContent='未開始'; els.claimTurnBtn.style.display='inline-flex'; els.claimTurnBtn.disabled=false; els.releaseTurnBtn.style.display='none'; els.drawBtn.disabled=true; }
}
function startCountdown(){ stopCountdown(); updateTurnUi(); state.countdownTimer=setInterval(async()=>{ updateTurnUi(); if(getTurnSecondsLeft()<=0){ stopCountdown(); await refreshCurrentCampaign(true); } },1000); }
function getDrawRows(result){ return Array.isArray(result?.results) ? result.results : (Array.isArray(result?.draw_results) ? result.draw_results : []); }
function getTicketKey(row, idx){ return String(row?.ticket_no ?? row?.ticket_pool_id ?? row?.id ?? `idx-${idx}`); }
function isWinningRow(row){ return Boolean((row?.prize_name && String(row.prize_name).trim()) || (row?.prize_code && String(row.prize_code).trim())); }
function buildTicketFront(row, idx){ return `<div class="ticket-face ticket-face-front"><span class="ticket-seq">${String(idx+1).padStart(3,'0')}</span></div>`; }
function buildTicketBack(row, idx){ const winning = isWinningRow(row); const title = winning ? `${escapeHtml(row.prize_code || '')} ${escapeHtml(row.prize_name || '')}`.trim() : '未中獎'; const subtitle = winning ? `票號 ${escapeHtml(row.ticket_no ?? String(idx+1).padStart(3,'0'))}` : '再接再厲'; return `<div class="ticket-face ticket-face-back ${winning ? 'is-winning' : 'is-losing'}"><span class="ticket-seq ticket-seq-back">${escapeHtml(String(row.ticket_no ?? String(idx+1).padStart(3,'0')).padStart(3,'0'))}</span><div class="ticket-result-title">${title}</div><div class="ticket-result-subtitle">${subtitle}</div></div>`; }
function toggleTicketReveal(ticketKey, button){ if(state.revealedTicketNos.has(ticketKey)){ return; } state.revealedTicketNos.add(ticketKey); button.classList.add('is-revealed'); button.setAttribute('aria-pressed','true'); }
function renderResultBox(){ const result = state.latestDrawResult; if(!result){ els.drawResultSummary.innerHTML=''; els.drawResultBox.innerHTML='<div class="empty-state">尚未抽獎</div>'; if(els.revealAllBtn) els.revealAllBtn.style.display='none'; return; } const rows = getDrawRows(result); const spent = result.points_spent ?? result.total_points_spent ?? null; const total = rows.length; const winningCount = rows.filter(isWinningRow).length; els.drawResultSummary.innerHTML = `<div class="result-summary-card">${spent!=null?`本次扣除 <strong>${Number(spent)}</strong> 點 ・ `:''}共 <strong>${total}</strong> 張籤紙 ・ 中獎 <strong>${winningCount}</strong> 張</div>`; if(!rows.length){ els.drawResultBox.innerHTML='<div class="empty-state">本次沒有回傳獎項資料</div>'; if(els.revealAllBtn) els.revealAllBtn.style.display='none'; return; } els.drawResultBox.innerHTML = rows.map((row,idx)=>{ const ticketKey = getTicketKey(row, idx); const revealed = state.revealedTicketNos.has(ticketKey); return `<button class="ticket-card ${revealed ? 'is-revealed' : ''}" type="button" data-ticket-key="${escapeHtml(ticketKey)}" aria-pressed="${revealed ? 'true' : 'false'}">${buildTicketFront(row, idx)}${buildTicketBack(row, idx)}</button>`; }).join(''); els.drawResultBox.querySelectorAll('.ticket-card').forEach((button)=>{ button.addEventListener('click',()=>toggleTicketReveal(button.dataset.ticketKey || '', button)); }); if(els.revealAllBtn) els.revealAllBtn.style.display = rows.length ? 'inline-flex' : 'none'; }
function renderCurrentCampaign(){ const detail=state.currentDetail; if(!detail){ els.campaignEmpty.style.display='block'; els.campaignDetail.style.display='none'; return; } const campaign=detail.campaign||{}; els.campaignEmpty.style.display='none'; els.campaignDetail.style.display='block'; els.campaignTitle.textContent=campaign.title||'-'; els.campaignImage.src=campaign.cover_image_url||'https://placehold.co/1200x600?text=KUJI'; els.campaignDescription.textContent=campaign.description||'暫無活動說明'; els.campaignStatusBadge.textContent=campaign.status||'-'; els.campaignStatusBadge.className=`status-chip ${campaign.status==='active'?'busy':'idle'}`; const hold = Number(campaign.turn_hold_seconds ?? campaign.reserve_seconds ?? 0); els.campaignStats.innerHTML=`<div class="stat-chip">每抽 ${Number(campaign.points_per_draw||0)} 點</div><div class="stat-chip">總籤數 ${Number(campaign.total_tickets||0)}</div><div class="stat-chip">剩餘 ${Number(campaign.remaining_tickets||0)}</div><div class="stat-chip">單次最多 ${Number(campaign.max_draw_per_order||1)} 抽</div><div class="stat-chip">回合保留 ${hold} 秒</div>`;
  const max=Number(campaign.max_draw_per_order||1); els.drawCountInput.max=String(max); if(Number(els.drawCountInput.value)>max) els.drawCountInput.value=String(max);
  const prizes = detail.prizes || []; els.prizeList.innerHTML = prizes.length ? prizes.map(p=>`<article class="prize-card"><img class="prize-image" src="${escapeHtml(p.prize_image_url || 'https://placehold.co/240x180?text=Prize')}" alt="${escapeHtml(p.prize_name)}"><div class="prize-body"><div class="prize-code">${escapeHtml(p.prize_code)}</div><h4>${escapeHtml(p.prize_name)}</h4><div class="prize-meta">剩餘 ${Number(p.remaining_quantity||0)} / 共 ${Number(p.total_quantity||0)}</div></div></article>`).join('') : '<div class="empty-state">尚未設定獎項</div>';
  renderResultBox();
  startCountdown();
}
async function loadDashboard(){ if(!state.accessToken) return; const data = await callApi('login'); state.member=data.member; renderMember(data.member,data.points); }
async function loadCampaigns(){ const data=await callApi('get_kuji_campaigns',{},false); state.campaigns=data.campaigns||[]; renderCampaignList(); if(state.currentCampaignId && !state.campaigns.some(c=>Number(c.id)===Number(state.currentCampaignId))){ state.currentCampaignId = state.campaigns[0] ? Number(state.campaigns[0].id) : null; } if(!state.currentCampaignId && state.campaigns[0]) state.currentCampaignId=Number(state.campaigns[0].id); if(state.currentCampaignId) await openCampaign(state.currentCampaignId,true); }
async function openCampaign(campaignId,silent=false){ state.currentCampaignId=campaignId; const data=await callApi('get_kuji_campaign_detail',{campaignId},!!state.accessToken); state.currentDetail=data; renderCampaignList(); renderCurrentCampaign(); const url=new URL(window.location.href); url.searchParams.set('campaignId',String(campaignId)); window.history.replaceState({},document.title,url.toString()); if(!silent) clearMessage(); }
async function refreshCurrentCampaign(silent=false){ if(!state.currentCampaignId) return; await openCampaign(state.currentCampaignId,silent); }
async function claimTurn(){ try{ setButtonLoading(els.claimTurnBtn,true); clearMessage(); const result=await callApi('claim_kuji_turn',{campaignId:state.currentCampaignId}); showMessage(result.message || '已取得抽籤回合'); await refreshCurrentCampaign(true); } catch(error){ showMessage(normalizeError(error,'取得抽籤回合失敗'),true); await refreshCurrentCampaign(true);} finally{ setButtonLoading(els.claimTurnBtn,false);} }
async function releaseTurn(){ try{ setButtonLoading(els.releaseTurnBtn,true); clearMessage(); const result=await callApi('release_kuji_turn',{campaignId:state.currentCampaignId}); showMessage(result.message || '已放棄抽籤回合'); await refreshCurrentCampaign(true); } catch(error){ showMessage(normalizeError(error,'放棄回合失敗'),true); await refreshCurrentCampaign(true);} finally{ setButtonLoading(els.releaseTurnBtn,false);} }
async function drawNow(){ try{ setButtonLoading(els.drawBtn,true,'抽籤中...'); clearMessage(); const drawCount = Number(els.drawCountInput.value || 1); const result=await callApi('draw_kuji_with_points',{campaignId:state.currentCampaignId,drawCount,requestId:makeRequestId('kuji-draw')}); state.latestDrawResult=result; state.revealedTicketNos = new Set(); renderResultBox(); showMessage(result.message || '抽籤成功'); await loadDashboard(); await refreshCurrentCampaign(true); } catch(error){ showMessage(normalizeError(error,'抽籤失敗'),true); await refreshCurrentCampaign(true);} finally{ setButtonLoading(els.drawBtn,false);} }
async function signIn(){ if(!liff.isLoggedIn()){ liff.login({redirectUri:getCleanAppUrl()}); return; } await bootstrap(); }
async function signOut(){ stopCountdown(); if(window.liff&&liff.isLoggedIn()) liff.logout(); state.accessToken=null; state.member=null; renderMember(null); showMessage('已登出'); }
async function bootstrap(){ try{ const c=getConfig(); if(!c.liffId||!c.supabaseUrl||!c.supabaseAnonKey||!c.apiFunctionName) throw new Error('請先設定 config.js'); await liff.init({liffId:c.liffId,withLoginOnExternalBrowser:false}); if(liff.isLoggedIn()){ state.accessToken=liff.getAccessToken(); await loadDashboard(); } else { renderMember(null); }
 await loadCampaigns(); } catch(error){ showMessage(normalizeError(error,'初始化失敗'),true);} }
els.loginBtn?.addEventListener('click',signIn);
els.logoutBtn?.addEventListener('click',signOut);
els.refreshCampaignsBtn?.addEventListener('click',()=>loadCampaigns().catch(e=>showMessage(normalizeError(e,'刷新活動失敗'),true)));
els.refreshDetailBtn?.addEventListener('click',()=>refreshCurrentCampaign().catch(e=>showMessage(normalizeError(e,'刷新活動失敗'),true)));
els.claimTurnBtn?.addEventListener('click',()=>claimTurn());
els.releaseTurnBtn?.addEventListener('click',()=>releaseTurn());
els.drawBtn?.addEventListener('click',()=>drawNow());
window.addEventListener('pagehide',()=>stopCountdown());
bootstrap();

els.revealAllBtn?.addEventListener('click',()=>{ const rows = getDrawRows(state.latestDrawResult || {}); rows.forEach((row, idx)=>state.revealedTicketNos.add(getTicketKey(row, idx))); renderResultBox(); });
