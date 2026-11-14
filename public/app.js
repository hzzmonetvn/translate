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

function filterModels() {
  const query = $('model').value.toLowerCase();
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
