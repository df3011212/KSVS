/* --------------------------------------------------
   單篇文章頁 – 可收合 PINE 區塊 + 複製按鈕
-------------------------------------------------- */
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/+esm";

// ── 解析 ?id=xxx ─────────────────────────────────
const id = new URLSearchParams(location.search).get("id");

// ── 載入文章並渲染 ───────────────────────────────
(async () => {
  const res = await fetch("data/posts.json");
  const posts = await res.json();
  const post = posts.find(p => p.id === id);
  if (!post) return (document.body.innerHTML = "<p class='p-8'>404 – 找不到文章</p>");
  render(post);
})();

function render(p) {
  const root = document.getElementById("article");

  root.innerHTML = `
    <h1 class="text-2xl font-bold mb-4">${p.title}</h1>

    <!-- 影片區 — 若影片無法嵌入，使用者仍可點 Watch on YouTube -->
    <iframe class="w-full aspect-video rounded-lg mb-6"
            src="https://www.youtube.com/embed/${p.youtube}"
            allowfullscreen loading="lazy"></iframe>

    <!-- PINE 收合區塊 -->
    <details class="mb-6 group">
      <summary class="cursor-pointer flex items-center gap-1
                     text-emerald-400 hover:text-emerald-300
                     marker:content-['']">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0 group-open:-rotate-90 transition"
             fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
        查看 Pine 程式碼
      </summary>

      <pre class="bg-black text-green-400 p-3 mt-3 rounded-lg">
<code class="language-pinescript" id="pineBlock"></code>
      </pre>

      <button id="copyBtn"
        class="mt-3 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700
               text-white text-sm flex items-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none"
             viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16h8M8 12h8m-6 8h6M4 8h16M4 12h4M4 16h4" /></svg>
        複製 PINE
      </button>
    </details>

    <hr class="border-gray-700 mb-6"/>

    <!-- 留言區 -->
    <h2 class="font-semibold mb-2">💬 匿名留言</h2>
    <textarea id="msg" rows="3"
      class="w-full p-2 rounded-lg bg-[#161b22] mb-2"></textarea>
    <button id="sendBtn"
      class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm">
      送出
    </button>
    <div id="commentList" class="space-y-2 mt-4"></div>
  `;

  // 填入原始程式碼（保持換行）
  document.getElementById("pineBlock").textContent = p.pine;
  hljs.highlightAll();                         // 語法上色

  // 複製按鈕
  document.getElementById("copyBtn").onclick = () =>
    navigator.clipboard.writeText(p.pine).then(() =>
      alert("已複製！"));

  // 載入留言
  const list = document.getElementById("commentList");
  p.comments?.forEach(c => list.insertAdjacentHTML("beforeend", tplComment(c)));

  // 送出留言
  document.getElementById("sendBtn").onclick = () => {
    const txt = document.getElementById("msg").value.trim();
    if (!txt) return;
    const c = { ts: Date.now(), body: txt };
    (p.comments || (p.comments = [])).push(c);
    list.insertAdjacentHTML("afterbegin", tplComment(c));
    document.getElementById("msg").value = "";
    localStorage.setItem("pending_comments", JSON.stringify({ id: p.id, c }));
    alert("留言已暫存，請稍候站長同步。");
  };
}

// 生成留言 HTML
function tplComment(c) {
  const d = new Date(c.ts).toLocaleString();
  const safe = c.body.replace(/[<>&]/g, s => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[s]));
  return `<div class="bg-[#161b22] p-2 rounded-lg">
            <span class="text-xs text-gray-400">${d}</span><br/>${safe}
          </div>`;
}

document.getElementById("backBtn").onclick = () => {
  const prevLength = history.length;
  history.back();
  setTimeout(() => {
    if (history.length === prevLength) {
      location.href = "index.html";
    }
  }, 500);
};
