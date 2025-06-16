let posts = [];

function renderAll() {
  const list = document.getElementById("articleList");
  list.innerHTML = "";

  posts.forEach((post, index) => {
    const box = document.createElement("div");
    box.className = "bg-[#161b22] p-4 rounded-xl";

    const dateStr = new Date(post.date).toLocaleString();

    box.innerHTML = `
      <div class="flex justify-between items-center">
        <h2 class="text-lg font-semibold">${post.title}</h2>
        <button class="text-red-500 hover:underline" onclick="deletePost(${index})">❌ 刪除</button>
      </div>
      <p class="text-sm text-gray-400">🕒 ${dateStr}</p>
      <p class="mt-2 text-sm text-gray-300">${post.summary}</p>
      <iframe class="w-full aspect-video rounded mt-4"
              src="https://www.youtube.com/embed/${post.youtube}"
              loading="lazy" allowfullscreen></iframe>
      <details class="mt-4">
        <summary class="cursor-pointer text-emerald-400">📄 查看 Pine 程式碼</summary>
        <pre class="bg-black text-green-400 p-2 mt-2 rounded text-sm whitespace-pre-wrap">${post.pine}</pre>
      </details>
    `;
    list.appendChild(box);
  });
}

function deletePost(index) {
  if (!confirm("確定要刪除這篇文章？")) return;
  posts.splice(index, 1);
  renderAll();
}

document.getElementById("downloadBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(posts, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "posts.json";
  a.click();
  URL.revokeObjectURL(url);
};

(async () => {
  const res = await fetch("data/posts.json?_=" + Date.now());
  posts = await res.json();
  renderAll();
})();
