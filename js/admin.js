async function fetchPosts() {
  const res = await fetch('data/posts.json?_=' + Date.now());
  return await res.json();
}

document.getElementById('add').onclick = async () => {
  const title   = document.getElementById('title').value.trim();
  const yt      = document.getElementById('yt').value.trim();
  const summary = document.getElementById('summary').value.trim();
  const pine    = document.getElementById('pine').value.trim();
  if (!title || !yt || !pine) return alert('必填欄位未填');

  // 1. 讀取舊 posts
  const posts = await fetchPosts();

  // 2. 合併 pending comments（如有）
  const pending = JSON.parse(localStorage.getItem('pending_comments') || '{}');
  if (pending.id) {
    const post = posts.find(p => p.id === pending.id);
    if (post) {
      post.comments = (post.comments || []).concat(pending.c);
      localStorage.removeItem('pending_comments');
    }
  }

  // 3. 新增文章
  posts.unshift({
    id      : crypto.randomUUID(),
    title   : title,
    youtube : yt,
    summary : summary,
    pine    : pine,
    date    : Date.now()
  });

  // 4. 下載為檔案（手動 commit）
  const blob = new Blob([JSON.stringify(posts, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url;
  a.download = 'posts.json';
  a.click();
  URL.revokeObjectURL(url);

  alert('✅ 已匯出新版 posts.json，請覆蓋並 push。');
};

// ── 顯示待合併留言 ─────────────────────────────
const pending = JSON.parse(localStorage.getItem('pending_comments') || '{}');
if (pending.id) {
  document.getElementById('cmtBox').textContent =
    JSON.stringify(pending, null, 2);
} else {
  document.getElementById('cmtBox').textContent = '（無）';
}
