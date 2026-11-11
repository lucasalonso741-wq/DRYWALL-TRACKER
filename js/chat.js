'use strict';
/* =====================================================================
   Assistant chat: talk to the app to look things up or change them
   ===================================================================== */
const CHAT = { open: false, msgs: [], busy: false };
const CHAT_IDEAS = ['Which job has the highest cost per board?', 'Put every PO with "7605" in the memo on a job called 7605 New Work', 'What did Amelia spend on framing so far?', 'Mark Station 21 as 100% and finished'];

function chatRender() {
  const box = $('#chat-log'); if (!box) return;
  box.innerHTML = (CHAT.msgs.length ? '' : `<div class="muted small mb">Ask a question or tell me what to change. Try:</div>${CHAT_IDEAS.map(t => `<button class="idea" onclick="A.chatSend(this.textContent)">${esc(t)}</button>`).join('')}`) +
    CHAT.msgs.map(m => `<div class="cm ${m.role}">${esc(m.content).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</div>`).join('') + (CHAT.busy ? '<div class="cm assistant"><span class="dots">Working</span></div>' : '');
  box.scrollTop = box.scrollHeight;
}
A.chatToggle = () => {
  CHAT.open = !CHAT.open; $('#chat').hidden = !CHAT.open; $('#chat-fab').hidden = CHAT.open;
  if (CHAT.open) { chatRender(); setTimeout(() => $('#chat-in').focus(), 50); }
};
A.chatClear = () => { CHAT.msgs = []; chatRender(); };
A.chatSend = async (text) => {
  text = (text || $('#chat-in').value).trim(); if (!text || CHAT.busy) return;
  $('#chat-in').value = ''; CHAT.msgs.push({ role: 'user', content: text }); CHAT.busy = true; chatRender();
  try {
    const { data, error } = await sb.functions.invoke('assistant', { body: { messages: CHAT.msgs } });
    if (error) {
      let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {}
      throw new Error(m);
    }
    if (data.error) throw new Error(data.error);
    CHAT.msgs.push({ role: 'assistant', content: data.text || 'Done.' });
    if (data.changed) { S.cache = {}; await loadCore(); await rerender(); }
  } catch (e) {
    CHAT.msgs.push({ role: 'assistant', content: 'Sorry, that did not work: ' + errMsg(e) + (/credit|balance|billing/i.test(String(e.message)) ? ' (The Anthropic account needs credits.)' : '') });
  } finally { CHAT.busy = false; chatRender(); }
};
document.body.insertAdjacentHTML('beforeend', `<button id="chat-fab" onclick="A.chatToggle()" hidden>Ask</button>
  <aside id="chat" hidden><div class="chat-head"><b>Assistant</b><span class="grow"></span><button class="btn sm ghost" onclick="A.chatClear()">Clear</button><button class="x" onclick="A.chatToggle()">&times;</button></div>
  <div id="chat-log"></div><form class="chat-form" onsubmit="event.preventDefault();A.chatSend()"><input id="chat-in" placeholder="Ask or tell me what to do" autocomplete="off"><button class="btn primary">Send</button></form></aside>`);
const _enter = enter;
enter = async function () { await _enter(); $('#chat-fab').hidden = CHAT.open; };
