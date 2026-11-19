// The server answers 401 with code login_required when the login cookie no longer matches a
// session: it expired, was signed out, or the password was changed on another device. Any
// request that sees it reports it here, and the account shell signs this device out once.
export const LOGIN_REQUIRED = 'login_required';
export const SESSION_EXPIRED_EVENT = 'zhiyin:session-expired';

export const reportSessionExpired = () => { window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)); };

// True (and reported) when a failed response says the session is gone.
export async function sessionExpired(response) {
  if (response.status !== 401) return false;
  const data = await response.clone().json().catch(() => ({}));
  if (data?.code !== LOGIN_REQUIRED) return false;
  reportSessionExpired();
  return true;
}
