async function loadPosts() {
  const res   = await fetch('data/posts.json?_=' + Date.now()); // 避免快取
  const posts = await res.json();
  const grid  = document.getElementById('cardGrid');

  posts.forEach(p => {
    const div = document.createElement('div');
    div.className =
      'bg-[#161b22] rounded-2xl shadow-lg p-4 flex flex-col justify-between';

    // 卡片內容
    div.innerHTML = `
      <h2 class="text-lg font-semibold mb-2">${p.title}</h2>
      <iframe class="w-full aspect-video rounded-lg mb-2"
              src="https://www.youtube.com/embed/${p.youtube}"
              loading="lazy" allowfullscreen></iframe>
      <p class="text-sm text-gray-400 line-clamp-2">${p.summary}</p>
      <a href="post.html?id=${p.id}"
         class="mt-4 inline-block self-end px-3 py-1 rounded-lg
                bg-emerald-600 hover:bg-emerald-700 text-white text-sm">
        詳細 →
      </a>`;
    grid.appendChild(div);
  });
}
loadPosts();
