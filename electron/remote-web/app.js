/* ForgeTerm Remote - Client */
(function () {
  'use strict';

  // State
  let currentWindows = [];
  let currentWindowId = null;
  let currentSessionId = null;
  let ws = null;
  let term = null;
  let fitAddon = null;
  let resizeObserver = null;

  // Derive base path from current URL (e.g., /s/abc123def456/)
  const basePath = location.pathname.replace(/\/+$/, '');

  // DOM refs
  const views = {
    login: document.getElementById('login-view'),
    windows: document.getElementById('windows-view'),
    sessions: document.getElementById('sessions-view'),
    terminal: document.getElementById('terminal-view'),
  };

  const els = {
    pinInput: document.getElementById('pin-input'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),
    windowsList: document.getElementById('windows-list'),
    emptyState: document.getElementById('empty-state'),
    refreshBtn: document.getElementById('refresh-btn'),
    backToWindows: document.getElementById('back-to-windows'),
    sessionsTitle: document.getElementById('sessions-title'),
    sessionsList: document.getElementById('sessions-list'),
    sessionsRefreshBtn: document.getElementById('sessions-refresh-btn'),
    backToSessions: document.getElementById('back-to-sessions'),
    terminalTitle: document.getElementById('terminal-title'),
    terminalContainer: document.getElementById('terminal-container'),
    terminalRestartBtn: document.getElementById('terminal-restart-btn'),
    terminalKillBtn: document.getElementById('terminal-kill-btn'),
  };

  // ---- Navigation ----
  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== name);
    });
  }

  // ---- API helpers ----
  // All API calls use cookies for auth (HttpOnly cookie set by /api/auth)
  async function apiFetch(apiPath, opts = {}) {
    const res = await fetch(basePath + '/' + apiPath, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    });
    if (res.status === 401) {
      showLoginView();
      throw new Error('Unauthorized');
    }
    return res.json();
  }

  // ---- Auth ----
  async function tryLogin(pin) {
    try {
      const res = await fetch(basePath + '/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) return false;
      // Cookie is set by the server, no need to store anything client-side
      await loadWindows();
      showView('windows');
      return true;
    } catch {
      return false;
    }
  }

  function showLoginView() {
    showView('login');
    els.pinInput.value = '';
    els.loginError.classList.add('hidden');
  }

  // ---- Windows list ----
  async function loadWindows() {
    try {
      currentWindows = await apiFetch('api/windows');
      renderWindows();
    } catch (e) {
      console.error('Failed to load windows:', e);
    }
  }

  function renderWindows() {
    els.windowsList.innerHTML = '';
    els.emptyState.classList.toggle('hidden', currentWindows.length > 0);

    currentWindows.forEach(win => {
      const card = document.createElement('div');
      card.className = 'card';
      if (win.accentColor) {
        card.setAttribute('data-accent', '');
        card.style.setProperty('--card-accent', win.accentColor);
      }

      const runningCount = win.sessions.filter(s => s.running).length;
      const totalCount = win.sessions.length;

      card.innerHTML = `
        <div class="card-header">
          <div class="card-emoji">${win.emoji || '&#x1f4c1;'}</div>
          <div class="card-name">${escapeHtml(win.projectName)}</div>
          <div class="card-badge">${runningCount}/${totalCount}</div>
        </div>
        <div class="card-path">${escapeHtml(shortenPath(win.projectPath))}</div>
      `;

      card.addEventListener('click', () => openSessions(win.id));
      els.windowsList.appendChild(card);
    });
  }

  // ---- Sessions list ----
  function openSessions(winId) {
    currentWindowId = winId;
    const win = currentWindows.find(w => w.id === winId);
    if (!win) return;

    els.sessionsTitle.textContent = win.emoji
      ? win.emoji + ' ' + win.projectName
      : win.projectName;

    renderSessions(win.sessions);
    showView('sessions');
  }

  function renderSessions(sessions) {
    els.sessionsList.innerHTML = '';

    sessions.forEach(session => {
      const card = document.createElement('div');
      card.className = 'card';

      card.innerHTML = `
        <div class="session-card">
          <div class="session-status ${session.running ? 'running' : 'stopped'}"></div>
          <div class="session-info">
            <div class="session-name">${escapeHtml(session.name)}</div>
            ${session.command ? '<div class="session-command">' + escapeHtml(session.command) + '</div>' : ''}
          </div>
        </div>
      `;

      card.addEventListener('click', () => openTerminal(session.id, session.name));
      els.sessionsList.appendChild(card);
    });
  }

  async function refreshSessions() {
    try {
      currentWindows = await apiFetch('api/windows');
      const win = currentWindows.find(w => w.id === currentWindowId);
      if (win) {
        renderSessions(win.sessions);
      }
    } catch (e) {
      console.error('Failed to refresh sessions:', e);
    }
  }

  // ---- Terminal ----
  function openTerminal(sessionId, sessionName) {
    currentSessionId = sessionId;
    els.terminalTitle.textContent = sessionName;
    showView('terminal');

    destroyTerminal();

    term = new Terminal({
      fontSize: 14,
      fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: '#0d0d0d',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: 'rgba(108, 140, 255, 0.3)',
      },
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    term.loadAddon(webLinksAddon);

    term.open(els.terminalContainer);

    requestAnimationFrame(() => {
      fitAddon.fit();
      connectWebSocket();
    });

    resizeObserver = new ResizeObserver(() => {
      if (fitAddon) {
        fitAddon.fit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      }
    });
    resizeObserver.observe(els.terminalContainer);

    term.onData(data => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });
  }

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Cookie is sent automatically with the WebSocket handshake
    const wsUrl = `${protocol}//${location.host}${basePath}/api/terminal/${currentWindowId}/${currentSessionId}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (term && fitAddon) {
        fitAddon.fit();
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data' && term) {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          term?.write('\r\n\x1b[90m--- Session exited ---\x1b[0m\r\n');
        } else if (msg.type === 'info') {
          // Initial session info received
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (term && !views.terminal.classList.contains('hidden')) {
        term.write('\r\n\x1b[33m--- Disconnected ---\x1b[0m\r\n');
      }
    };

    ws.onerror = () => {};
  }

  function destroyTerminal() {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (term) {
      term.dispose();
      term = null;
    }
    if (fitAddon) {
      fitAddon = null;
    }
    els.terminalContainer.innerHTML = '';
  }

  async function restartSession() {
    if (!currentWindowId || !currentSessionId) return;
    try {
      await apiFetch(`api/sessions/${currentWindowId}/${currentSessionId}/restart`, { method: 'POST' });
      if (ws) ws.close();
      if (term) {
        term.clear();
        term.write('\x1b[90m--- Restarting ---\x1b[0m\r\n');
      }
      setTimeout(connectWebSocket, 500);
    } catch (e) {
      console.error('Failed to restart session:', e);
    }
  }

  async function killSession() {
    if (!currentWindowId || !currentSessionId) return;
    try {
      await apiFetch(`api/sessions/${currentWindowId}/${currentSessionId}/kill`, { method: 'POST' });
    } catch (e) {
      console.error('Failed to kill session:', e);
    }
  }

  // ---- Utilities ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function shortenPath(p) {
    const home = '/Users/';
    const idx = p.indexOf(home);
    if (idx === 0) {
      const parts = p.slice(home.length).split('/');
      if (parts.length > 1) {
        return '~/' + parts.slice(1).join('/');
      }
    }
    return p;
  }

  // ---- Event listeners ----
  els.loginBtn.addEventListener('click', async () => {
    const pin = els.pinInput.value.trim();
    if (!pin) return;
    els.loginBtn.disabled = true;
    els.loginBtn.textContent = 'Connecting...';
    const ok = await tryLogin(pin);
    els.loginBtn.disabled = false;
    els.loginBtn.textContent = 'Connect';
    if (!ok) {
      els.loginError.textContent = 'Invalid PIN';
      els.loginError.classList.remove('hidden');
    }
  });

  els.pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.loginBtn.click();
  });

  els.refreshBtn.addEventListener('click', loadWindows);
  els.sessionsRefreshBtn.addEventListener('click', refreshSessions);

  els.backToWindows.addEventListener('click', () => {
    showView('windows');
    loadWindows();
  });

  els.backToSessions.addEventListener('click', () => {
    destroyTerminal();
    showView('sessions');
    refreshSessions();
  });

  els.terminalRestartBtn.addEventListener('click', restartSession);
  els.terminalKillBtn.addEventListener('click', killSession);

  // ---- Init ----
  async function init() {
    // Check URL hash for PIN (from QR code scan)
    // Hash fragment is never sent to the server or logged by proxies
    const hashPin = location.hash ? location.hash.slice(1) : '';
    if (hashPin) {
      // Clear hash immediately so PIN isn't visible in address bar
      history.replaceState(null, '', location.pathname + location.search);
      const ok = await tryLogin(hashPin);
      if (ok) return;
    }

    // Try existing cookie by loading windows
    try {
      currentWindows = await apiFetch('api/windows');
      renderWindows();
      showView('windows');
    } catch {
      showView('login');
    }
  }

  init();
})();
