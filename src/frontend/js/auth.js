/* ─── Operator authentication gate ─── */
const Auth = {
  tokenKey: 'grid-risk-token',
  mode: 'login',
  cursor: { x: window.innerWidth / 2, y: window.innerHeight / 2 },

  isAuthenticated() {
    return Boolean(localStorage.getItem(this.tokenKey));
  },

  setMessage(id, message) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message || '';
    node.hidden = !message;
  },

  setLoading(loading) {
    const button = document.getElementById('auth-submit');
    const label = document.getElementById('auth-submit-label');
    if (!button || !label) return;
    button.disabled = loading;
    label.textContent = loading
      ? (this.mode === 'login' ? 'Authenticating...' : 'Provisioning access...')
      : (this.mode === 'login' ? 'Sign in to console' : 'Create operator account');
  },

  setMode(mode) {
    this.mode = mode === 'signup' ? 'signup' : 'login';
    const signupOnly = document.querySelectorAll('.auth-signup-only');
    const loginOptions = document.getElementById('auth-login-options');
    const title = document.getElementById('auth-title');
    const eyebrow = document.getElementById('auth-eyebrow');
    const subtitle = document.getElementById('auth-subtitle');
    const switchCopy = document.getElementById('auth-switch-copy');
    const switchLink = document.getElementById('auth-switch-link');
    const password = document.getElementById('auth-password');
    const terms = document.getElementById('auth-terms');
    const isSignup = this.mode === 'signup';

    signupOnly.forEach(node => { node.hidden = !isSignup; });
    loginOptions.hidden = isSignup;
    eyebrow.textContent = isSignup ? 'OPERATOR CONSOLE / ACCESS REQUEST' : 'OPERATOR CONSOLE / SIGN IN';
    title.textContent = isSignup ? 'Provision your operator access.' : 'Welcome back, operator.';
    subtitle.textContent = isSignup
      ? 'Create a secure account for the grid command center.'
      : 'Sign in to access live grid intelligence and dispatch controls.';
    switchCopy.textContent = isSignup ? 'Already have an operator account?' : 'New to the command center?';
    switchLink.textContent = isSignup ? 'Return to sign in' : 'Request operator access';
    switchLink.href = isSignup ? '#login' : '#signup';
    password.autocomplete = isSignup ? 'new-password' : 'current-password';
    password.placeholder = isSignup ? 'At least 8 characters' : 'Enter your password';
    terms.required = isSignup;
    this.setMessage('auth-error', '');
    this.setMessage('auth-success', '');
  },

  show() {
    document.getElementById('auth-gate')?.classList.remove('is-hidden');
    this.setMode((location.hash || '').replace('#', '') === 'signup' ? 'signup' : 'login');
  },

  hide() {
    document.getElementById('auth-gate')?.classList.add('is-hidden');
  },

  async submit(event) {
    event.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const displayName = document.getElementById('auth-name').value.trim();
    const password = document.getElementById('auth-password').value;
    const terms = document.getElementById('auth-terms');
    this.setMessage('auth-error', '');
    this.setMessage('auth-success', '');

    if (!email || !email.includes('@')) {
      this.setMessage('auth-error', 'Enter a valid work email address.');
      return;
    }
    if (this.mode === 'signup' && displayName.length < 2) {
      this.setMessage('auth-error', 'Enter your name so the control room can identify you.');
      return;
    }
    if (password.length < 8) {
      this.setMessage('auth-error', 'Password must be at least 8 characters.');
      return;
    }
    if (this.mode === 'signup' && !terms.checked) {
      this.setMessage('auth-error', 'Accept the operator access policy to continue.');
      return;
    }

    this.setLoading(true);
    try {
      const result = this.mode === 'login'
        ? await API.login({ email, password })
        : await API.signup({ display_name: displayName, email, password });
      const user = { ...(result.user || {}), display_name: result.user?.display_name || displayName || email };
      localStorage.setItem(this.tokenKey, result.token);
      localStorage.setItem('grid-risk-user', JSON.stringify(user));
      Auth.renderOperator(user);
      this.hide();
      location.hash = 'overview';
      if (window.App && !App._initialized) await App.init();
    } catch (error) {
      this.setMessage('auth-error', error.message || 'Authentication failed. Try again.');
    } finally {
      this.setLoading(false);
    }
  },

  init() {
    this.initCreatureTracking();
    document.getElementById('auth-form')?.addEventListener('submit', event => this.submit(event));
    document.getElementById('auth-toggle-password')?.addEventListener('click', event => {
      const input = document.getElementById('auth-password');
      const icon = event.currentTarget.querySelector('.material-symbols-outlined');
      input.type = input.type === 'password' ? 'text' : 'password';
      icon.textContent = input.type === 'password' ? 'visibility' : 'visibility_off';
      event.currentTarget.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
    });
    document.getElementById('auth-forgot')?.addEventListener('click', event => {
      event.preventDefault();
      this.setMessage('auth-success', 'Contact your control-room administrator to reset credentials.');
    });
    window.addEventListener('hashchange', () => {
      const route = (location.hash || '').replace('#', '');
      if (route === 'login' || route === 'signup') this.show();
    });
    if (this.isAuthenticated()) {
      try { this.renderOperator(JSON.parse(localStorage.getItem('grid-risk-user') || '{}')); } catch (_) {}
      this.hide();
    }
    else this.show();
  },

  initCreatureTracking() {
    const scene = document.getElementById('auth-creatures');
    if (!scene) return;
    const update = () => {
      scene.querySelectorAll('.auth-eye i, .auth-pupil').forEach(eye => {
        const rect = eye.getBoundingClientRect();
        const dx = this.cursor.x - (rect.left + rect.width / 2);
        const dy = this.cursor.y - (rect.top + rect.height / 2);
        const distance = Math.min(5, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        eye.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
      });
    };
    window.addEventListener('mousemove', event => {
      this.cursor.x = event.clientX;
      this.cursor.y = event.clientY;
      update();
    });
    update();
  },

  renderOperator(user) {
    const name = user.display_name || user.email || 'Operator';
    const nameNode = document.getElementById('operator-name');
    const roleNode = document.getElementById('operator-role');
    if (nameNode) nameNode.textContent = name;
    if (roleNode) roleNode.textContent = user.role === 'admin' ? 'Grid Administrator' : 'Grid Operator';
  },

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem('grid-risk-user');
    location.hash = 'login';
    this.show();
  }
};

window.addEventListener('DOMContentLoaded', () => Auth.init());