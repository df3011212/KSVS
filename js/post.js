import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm";

// ── 取得 ?id=xxx ─────────────────────────────────────────
const urlParams = new URLSearchParams(location.search);
const postId    = urlParams.get('id');

// ── 載入文章 ─────────────────────────────────────────────
(async () => {
  const res   = await fetch('data/posts.json');
  const posts = await res.json();
  const post  = posts.find(p => p.id === postId);
  if (!post) return (document.body.innerHTML = '<p>404</p>');

  renderPost(post);
})();

function renderPost(p) {
  const el = document.getElementById('article');
  el.innerHTML = `
    <h1 class="text-2xl font-bold mb-4">${p.title}</h1>
    <iframe class="w-full aspect-video rounded-lg mb-6"
            src="https://www.youtube.com/embed/${p.youtube}"
            allowfullscreen></iframe>

    <pre><code id="pineBlock" class="language-pinescript">${p.pine}</code></pre>
    <button id="copyBtn" class="mt-2 px-3 py-1 rounded-lg bg-indigo-600">🔗 複製 PINE</button>

    <hr class="my-6 border-gray-700" />
    <h2 class="font-semibold mb-2">💬 匿名留言</h2>
    <textarea id="msg" rows="3"
      class="w-full p-2 rounded-lg bg-[#161b22] mb-2"></textarea>
    <button id="sendBtn"
      class="px-3 py-1 rounded-lg bg-emerald-600">送出</button>
    <div id="commentList" class="space-y-2 mt-4"></div>
  `;
  hljs.highlightAll();

  // 複製按鈕
  document.getElementById('copyBtn').onclick = () =>
    navigator.clipboard.writeText(p.pine).then(() =>
      alert('已複製！'));

  // 留言載入
  const list = document.getElementById('commentList');
  p.comments?.forEach(c =>
    list.insertAdjacentHTML('beforeend', commentTpl(c)));

  // 送出留言
  document.getElementById('sendBtn').onclick = () => {
    const txt = document.getElementById('msg').value.trim();
    if (!txt) return;
    const c   = { ts: Date.now(), body: txt };
    p.comments = (p.comments || []).concat(c);
    list.insertAdjacentHTML('afterbegin', commentTpl(c));
    document.getElementById('msg').value = '';

    // 直接寫回 posts.json → 交給 admin.html 的「儲存」一併處理
    localStorage.setItem('pending_comments', JSON.stringify({ id: p.id, c }));
    alert('留言已暫存，請稍候站長同步。');
  };
}

function commentTpl(c) {
  const d = new Date(c.ts).toLocaleString();
  return `<div class="bg-[#161b22] p-2 rounded-lg">
            <span class="text-xs text-gray-400">${d}</span><br/>
            ${c.body.replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}
          </div>`;
}
