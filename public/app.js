const $ = (id) => document.getElementById(id);
const languageNames = {
  auto: 'Tự nhận diện', vi: 'Tiếng Việt', en: 'Tiếng Anh', ja: 'Tiếng Nhật', ko: 'Tiếng Hàn',
  'zh-CN': 'Tiếng Trung (Giản thể)', 'zh-TW': 'Tiếng Trung (Phồn thể)', fr: 'Tiếng Pháp',
  de: 'Tiếng Đức', es: 'Tiếng Tây Ban Nha', ru: 'Tiếng Nga', th: 'Tiếng Thái',
  id: 'Tiếng Indonesia', pt: 'Tiếng Bồ Đào Nha', it: 'Tiếng Ý', ar: 'Tiếng Ả Rập', hi: 'Tiếng Hindi',
};
let modelList = [];
let translating = false;
let requestController;
let modelController;
let sessionGeneration = 0;
const showError = (id, message = '') => { $(id).textContent = message; $(id).hidden = !message; };

function showLogin() {
  sessionGeneration++;
  requestController?.abort();
  modelController?.abort();
  $('boot').hidden = true;
  $('workspace').hidden = true;
  $('login-view').hidden = false;
  $('password').value = '';
  $('source-text').value = '';
  $('result-text').value = '';
  $('new-token').value = '';
  $('new-token-panel').hidden = true;
  $('token-list').replaceChildren();
  $('password-form').reset();
  $('char-count').textContent = '0 / 20.000';
  $('copy').disabled = true;
  showError('login-error');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Máy chủ trả về phản hồi không hợp lệ.'); }
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') showLogin();
    throw new Error(data.error || `Lỗi ${response.status}. Vui lòng thử lại.`);
  }
  return data;
}
function post(path, body, options = {}) { return api(path, { method: 'POST', body: JSON.stringify(body), ...options }); }

function filterModels(query = $('model').value.toLowerCase()) {
  const matches = modelList.filter((m) => m.id.toLowerCase().includes(query)).slice(0, 100);
  $('model-options').replaceChildren(...matches.map((m) => {
    const option = document.createElement('option'); option.value = m.id; return option;
  }));
}
async function loadModels(force = false) {
  if (modelList.length && !force) return;
  modelController?.abort();
  const controller = modelController = new AbortController();
  const generation = sessionGeneration;
  $('model-status').textContent = 'Đang tải model…';
  $('refresh-models').disabled = true;
  try {
    const data = await api('/api/v1/models', { signal: controller.signal });
    if (generation !== sessionGeneration) return;
    modelList = data.models;
    if (!$('model').value) $('model').value = data.defaultModel;
    filterModels();
    $('model-status').textContent = `${modelList.length.toLocaleString('vi-VN')} model từ OmniRoute`;
  } catch (error) {
    if (error.name === 'AbortError' || generation !== sessionGeneration) return;
    $('model-status').textContent = 'Tải model gặp lỗi. Hãy nhấn tải lại.';
    showError('translation-error', error.message);
  } finally { if (modelController === controller) $('refresh-models').disabled = false; }
}
function showWorkspace(user) {
  sessionGeneration++;
  $('boot').hidden = true; $('login-view').hidden = true; $('workspace').hidden = false;
  $('account-name').textContent = user.username;
  $('model').value = user.defaultModel || '';
  switchTab('translate');
  showError('global-error'); showError('translation-error');
  $('translation-status').textContent = 'Sẵn sàng khi bạn cần.';
  $('account-status').textContent = '';
  $('model-status').textContent = 'Mở danh sách để tải model từ OmniRoute';
}
function switchTab(tab) {
  for (const name of ['translate', 'account']) {
    const selected = name === tab;
    $(`${name}-panel`).hidden = !selected;
    $(`${name}-tab`).classList.toggle('active', selected);
    if (selected) $(`${name}-tab`).setAttribute('aria-current', 'page');
    else $(`${name}-tab`).removeAttribute('aria-current');
  }
  if (tab === 'account') loadTokens().catch((e) => showError('global-error', e.message));
  else { $('new-token').value = ''; $('new-token-panel').hidden = true; }
}

for (const [code, name] of Object.entries(languageNames)) {
  $('source-language').add(new Option(name, code));
  if (code !== 'auto') $('target-language').add(new Option(name, code));
}
$('target-language').value = 'vi';
$('api-example').textContent = `curl ${location.origin}/api/v1/translate \\\n  -H 'Authorization: Bearer YOUR_TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\n    "text": "Hello, world!",\n    "source": "auto",\n    "target": "vi",\n    "model": "cx/gpt-6.1-sol"\n  }'`;

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); showError('login-error');
  $('login-button').disabled = true; $('login-button').textContent = 'Đang đăng nhập…';
  try {
    await post('/api/auth/login', { username: $('username').value.trim(), password: $('password').value });
    $('password').value = '';
    showWorkspace(await api('/api/auth/me'));
  } catch (error) { showError('login-error', error.message); }
  finally { $('login-button').disabled = false; $('login-button').textContent = 'Đăng nhập'; }
});
$('logout').addEventListener('click', async () => {
  try { await post('/api/auth/logout', {}); showLogin(); }
  catch (error) { showError('global-error', error.message); }
});
$('translate-tab').addEventListener('click', () => switchTab('translate'));
$('account-tab').addEventListener('click', () => switchTab('account'));
$('model').addEventListener('input', filterModels);
$('model').addEventListener('focus', () => {
  if (modelList.length) filterModels();
  else loadModels();
});
$('refresh-models').addEventListener('click', () => { showError('translation-error'); loadModels(true); });
function clearResult() {
  $('result-text').value = ''; $('copy').disabled = true;
  $('translation-status').textContent = 'Sẵn sàng khi bạn cần.';
  showError('translation-error');
}
$('source-text').addEventListener('input', () => {
  $('char-count').textContent = `${$('source-text').value.length.toLocaleString('vi-VN')} / 20.000`;
  clearResult();
});
$('clear').addEventListener('click', () => { $('source-text').value = ''; $('source-text').dispatchEvent(new Event('input')); $('source-text').focus(); });
$('source-language').addEventListener('change', clearResult);
$('target-language').addEventListener('change', clearResult);
$('swap').addEventListener('click', () => {
  if ($('source-language').value === 'auto') { showError('translation-error', 'Chọn ngôn ngữ nguồn trước khi đảo chiều dịch.'); return; }
  const previous = $('source-language').value;
  $('source-language').value = $('target-language').value;
  $('target-language').value = previous;
  if ($('result-text').value) $('source-text').value = $('result-text').value;
  $('source-text').dispatchEvent(new Event('input'));
});
$('source-text').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault(); if (!translating) $('translation-form').requestSubmit();
  }
});
$('translation-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (translating) return;
  showError('translation-error');
  const text = $('source-text').value;
  const model = $('model').value.trim();
  if (!text.trim()) { showError('translation-error', 'Nhập văn bản cần dịch.'); return; }
  if (modelList.length && !modelList.some((m) => m.id === model)) { showError('translation-error', 'Chọn một model trong danh sách OmniRoute.'); return; }
  translating = true;
  const generation = sessionGeneration;
  const controls = ['source-text', 'source-language', 'target-language', 'model', 'swap', 'clear', 'translate-button'];
  controls.forEach((id) => { $(id).disabled = true; });
  $('translate-button').textContent = 'Đang dịch…';
  $('translation-status').textContent = 'Model đang xử lý văn bản…';
  $('result-text').value = ''; $('copy').disabled = true;
  requestController = new AbortController();
  const started = performance.now();
  try {
    const data = await post('/api/v1/translate', { text, source: $('source-language').value, target: $('target-language').value, model }, { signal: requestController.signal });
    if (generation !== sessionGeneration) return;
    $('result-text').value = data.translation;
    $('copy').disabled = false;
    $('translation-status').textContent = `Đã dịch · ${((performance.now() - started) / 1000).toFixed(1)} giây`;
  } catch (error) {
    if (generation !== sessionGeneration) return;
    showError('translation-error', error.message);
    $('translation-status').textContent = 'Chưa có bản dịch. Hãy thử lại.';
  } finally {
    translating = false;
    controls.forEach((id) => { $(id).disabled = false; });
    $('translate-button').textContent = 'Dịch văn bản ↗';
  }
});
async function copyText(text, button, original) {
  try { await navigator.clipboard.writeText(text); button.textContent = 'Đã sao chép'; }
  catch { showError('global-error', 'Hãy chọn và sao chép văn bản trực tiếp.'); return; }
  setTimeout(() => { button.textContent = original; }, 1800);
}
$('copy').addEventListener('click', () => copyText($('result-text').value, $('copy'), 'Sao chép'));
$('copy-token').addEventListener('click', () => copyText($('new-token').value, $('copy-token'), 'Sao chép token'));
$('hide-token').addEventListener('click', () => { $('new-token').value = ''; $('new-token-panel').hidden = true; });
async function loadTokens() {
  const generation = sessionGeneration;
  const data = await api('/api/tokens');
  if (generation !== sessionGeneration) return;
  $('token-empty').hidden = data.tokens.length > 0;
  $('token-list').replaceChildren(...data.tokens.map((token) => {
    const item = document.createElement('li');
    const info = document.createElement('span'); info.className = 'token-info'; info.textContent = token.name;
    const date = document.createElement('small'); date.textContent = `Tạo ${new Date(token.created).toLocaleDateString('vi-VN')}`; info.append(date);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = 'Thu hồi'; button.setAttribute('aria-label', `Thu hồi token ${token.name}`);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/api/tokens/${token.id}`, { method: 'DELETE', body: '{}' });
        $('new-token').value = ''; $('new-token-panel').hidden = true;
        await loadTokens();
      } catch (error) { showError('global-error', error.message); button.disabled = false; }
    });
    item.append(info, button); return item;
  }));
}
$('token-form').addEventListener('submit', async (event) => {
  event.preventDefault(); showError('global-error');
  const button = event.submitter; button.disabled = true;
  const generation = sessionGeneration;
  try {
    const data = await post('/api/tokens', { name: $('token-name').value });
    if (generation !== sessionGeneration) return;
    $('new-token').value = data.token; $('new-token-panel').hidden = false;
    $('token-name').value = ''; await loadTokens();
  } catch (error) { showError('global-error', error.message); }
  finally { button.disabled = false; }
});
$('password-form').addEventListener('submit', async (event) => {
  event.preventDefault(); showError('global-error'); $('account-status').textContent = '';
  const button = event.submitter; button.disabled = true;
  try {
    await post('/api/auth/password', { currentPassword: $('current-password').value, newPassword: $('new-password').value });
    $('password-form').reset(); $('account-status').textContent = 'Đã cập nhật mật khẩu. Các phiên đăng nhập khác đã kết thúc.';
  } catch (error) { showError('global-error', error.message); }
  finally { button.disabled = false; }
});
(async () => {
  try { showWorkspace(await api('/api/auth/me')); }
  catch (error) {
    showLogin();
    if (!error.message.includes('đăng nhập')) showError('login-error', 'Kết nối máy chủ gặp lỗi. Hãy tải lại trang.');
  }
})();

// --- Theme ---
const THEME_KEY = 'translate-theme';
const activeTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
function paintThemeButtons() {
  const dark = activeTheme() === 'dark';
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
    button.title = button.getAttribute('aria-label');
  }
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage is optional */ }
  paintThemeButtons();
}
for (const button of document.querySelectorAll('[data-theme-toggle]')) {
  button.addEventListener('click', () => applyTheme(activeTheme() === 'dark' ? 'light' : 'dark'));
}
paintThemeButtons();

// --- Translation modes ---
function setMode(mode) {
  for (const name of ['text', 'file']) {
    const selected = name === mode;
    $(`${name}-mode`).hidden = !selected;
    $(`mode-${name}`).classList.toggle('active', selected);
    $(`mode-${name}`).setAttribute('aria-selected', String(selected));
  }
  if (mode === 'file' && !$('file-model').value) $('file-model').value = $('model').value;
}
$('mode-text').addEventListener('click', () => setMode('text'));
$('mode-file').addEventListener('click', () => setMode('file'));

// --- File translation ---
for (const [code, name] of Object.entries(languageNames)) {
  $('file-source-language').add(new Option(name, code));
  if (code !== 'auto') $('file-target-language').add(new Option(name, code));
}
$('file-target-language').value = 'vi';
$('file-model').addEventListener('focus', () => {
  if (modelList.length) filterModels($('file-model').value.toLowerCase());
  else loadModels();
});

let selectedFile = null;
let fileResult = null;
let fileDownloadName = '';

function fileEstimate(text, name) {
  if (/\.xml$/i.test(name)) return (text.match(/<(?:string|item)\b[^>]*>/g) || []).length;
  return text.split(/\r?\n[ \t]*\r?\n/).filter((part) => part.trim()).length;
}
function fileLabel() {
  if (!selectedFile) { $('file-name').hidden = true; $('file-count').textContent = ''; return; }
  $('file-name').hidden = false;
  $('file-name').textContent = `${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(1)} KB`;
}
function chooseFile(file) {
  selectedFile = file || null;
  fileResult = null;
  $('file-result').hidden = true;
  $('file-error').hidden = true;
  $('file-status').textContent = '';
  $('file-progress').hidden = true;
  fileLabel();
  if (!file) { $('file-count').textContent = ''; return; }
  file.text().then((text) => {
    if (selectedFile !== file) return;
    const estimate = fileEstimate(text, file.name);
    $('file-count').textContent = estimate ? `~${estimate.toLocaleString('vi-VN')} mục cần dịch` : 'Không nhận diện được nội dung';
  }).catch(() => { $('file-count').textContent = ''; });
}
$('file-input').addEventListener('change', () => chooseFile($('file-input').files[0]));
const dropZone = $('file-drop');
dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  chooseFile(event.dataTransfer.files[0]);
});

function showFileError(message) {
  $('file-error').textContent = message;
  $('file-error').hidden = !message;
}
function fileEvent(event) {
  if (event.type === 'start') {
    $('file-progress').hidden = false;
    $('file-progress-bar').style.width = '0%';
    $('file-status').textContent = `Đang dịch 0 / ${event.total.toLocaleString('vi-VN')} mục…`;
    return;
  }
  if (event.type === 'progress') {
    const percent = event.total ? Math.round((event.done / event.total) * 100) : 0;
    $('file-progress-bar').style.width = `${percent}%`;
    $('file-status').textContent = `Đang dịch ${event.done.toLocaleString('vi-VN')} / ${event.total.toLocaleString('vi-VN')} mục…`;
    return;
  }
  if (event.type === 'error') { showFileError(event.error); return; }
  if (event.type !== 'done') return;
  fileResult = event;
  const target = $('file-target-language').value;
  const extension = (/\.([a-z0-9]+)$/i.exec(selectedFile?.name || '')?.[1] || 'txt').toLowerCase();
  fileDownloadName = `${(selectedFile?.name || 'translate').replace(/\.[^.]+$/, '')}-${target}.${extension}`;
  $('file-progress').hidden = true;
  $('file-status').textContent = '';
  $('file-summary').textContent = `Đã dịch ${event.translated.toLocaleString('vi-VN')} / ${(event.total - (event.skipped || 0)).toLocaleString('vi-VN')} mục${event.skipped ? ` · giữ nguyên ${event.skipped.toLocaleString('vi-VN')} mục không cần dịch` : ''}`;
  $('file-hint').textContent = event.format === 'xml'
    ? `Lưu tệp vào app/src/main/res/values-${target}/strings.xml để Android dùng làm ngôn ngữ phụ.`
    : 'Tệp giữ nguyên cấu trúc đoạn và định dạng Markdown.';
  $('file-preview').replaceChildren(...(event.preview || []).map((item) => {
    const row = document.createElement('li');
    const name = document.createElement('span'); name.className = 'preview-name'; name.textContent = item.name;
    const source = document.createElement('span'); source.className = 'preview-source'; source.textContent = item.source;
    const translation = document.createElement('span'); translation.className = 'preview-target'; translation.textContent = item.target || '(giữ nguyên)';
    row.append(name, source, translation);
    return row;
  }));
  if (event.failed) {
    const message = `Còn ${event.failed} mục chưa dịch được: ${event.failedNames.join(', ')}`;
    showFileError(message);
  }
  $('file-result').hidden = false;
  $('download-file').disabled = false;
}
$('file-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showFileError('');
  if (!selectedFile) { showFileError('Chọn một tệp trước khi dịch.'); return; }
  if (selectedFile.size > 10000000) { showFileError('Tệp vượt quá 10 MB.'); return; }
  const model = $('file-model').value.trim() || $('model').value.trim();
  if (!model) { showFileError('Chọn model dịch.'); return; }
  const button = $('file-button');
  button.disabled = true;
  $('file-result').hidden = true;
  $('download-file').disabled = true;
  fileResult = null;
  const original = button.innerHTML;
  button.textContent = 'Đang dịch tệp…';
  try {
    const response = await fetch('/api/v1/translate-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: selectedFile.name,
        content: await selectedFile.text(),
        source: $('file-source-language').value,
        target: $('file-target-language').value,
        model,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Lỗi ${response.status}. Vui lòng thử lại.`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const parsed = JSON.parse(line);
        fileEvent(parsed);
        if (parsed.type === 'done') finished = true;
        if (parsed.type === 'error') throw new Error(parsed.error);
      }
    }
    if (!finished) throw new Error('Kết nối kết thúc trước khi hoàn tất. Hãy thử lại.');
  } catch (error) {
    showFileError(error.message);
    $('file-status').textContent = '';
    $('file-progress').hidden = true;
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
});
$('download-file').addEventListener('click', () => {
  if (!fileResult) return;
  const type = fileResult.format === 'xml' ? 'application/xml' : 'text/plain';
  const url = URL.createObjectURL(new Blob([fileResult.output], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileDownloadName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});
