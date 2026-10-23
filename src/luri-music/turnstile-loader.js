let pending;

// Share a single script request across login dialogs; failed loads remain retryable.
export function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-turnstile="true"]');
    const created = !script;
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = 'true';
    }
    const cleanup = () => {
      window.clearTimeout(timer);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(new Error('人机验证加载失败，请检查网络后重试'));
    };
    const loaded = () => {
      if (!window.turnstile?.render) { failed(); return; }
      cleanup();
      resolve(window.turnstile);
    };
    const timer = window.setTimeout(failed, 15000);
    script.addEventListener('load', loaded);
    script.addEventListener('error', failed);
    if (created) document.head.appendChild(script);
  }).catch((error) => { pending = undefined; throw error; });
  return pending;
}
