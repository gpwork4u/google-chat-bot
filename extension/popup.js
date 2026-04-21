const BACKEND = 'http://localhost:8080';
const statusEl = document.getElementById('status');
const autoEl = document.getElementById('auto');

async function refresh() {
  try {
    const res = await fetch(`${BACKEND}/api/settings`);
    if (!res.ok) {
      throw new Error(`${res.status}`);
    }
    const s = await res.json();
    autoEl.checked = !!s.AutoMode;
    statusEl.className = 'status ok';
    statusEl.innerText = '後端已連線';
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.innerText = '後端沒啟動？（localhost:8080）';
  }
}

autoEl.addEventListener('change', async () => {
  await fetch(`${BACKEND}/api/settings/auto-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_mode: autoEl.checked }),
  });
});

refresh();
