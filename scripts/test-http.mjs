/**
 * HTTP helper for the live test suites.
 *
 * The one thing it adds over plain fetch is a retry on transport failures.
 * The Next dev server restarts itself when it approaches its memory ceiling,
 * which a long suite will trigger; the connection is reset mid-request and the
 * test fails for a reason that has nothing to do with the code under test.
 * Retrying a dropped connection keeps the suite honest — an application error
 * still arrives as a response with a status, and is never retried.
 */

const RETRIES = 4;
const BACKOFF_MS = 750;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for a dropped or refused connection, as opposed to an HTTP error. */
function isTransport(err) {
  const code = err?.cause?.code ?? err?.code;
  return ['ECONNRESET', 'ECONNREFUSED', 'UND_ERR_SOCKET', 'ETIMEDOUT', 'EPIPE'].includes(code);
}

export async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (!isTransport(err)) throw err;
      lastError = err;
      // Give the server time to come back up before trying again.
      await sleep(BACKOFF_MS * (attempt + 1));
    }
  }
  throw lastError;
}

/** Is a workspace server reachable at `base`? */
export async function probeServer(base) {
  try {
    const res = await fetchWithRetry(base + '/api/workspace/auth/me', { redirect: 'manual' });
    return res.status === 401 || res.ok;
  } catch {
    return false;
  }
}

/** Sign in and return the session cookie. */
export async function signIn(base, identifier, password) {
  const res = await fetchWithRetry(base + '/api/workspace/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    throw new Error(
      'sign-in failed for ' + identifier + ': ' + res.status + ' ' + (await res.text())
    );
  }
  const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('lyr_ws_session='));
  if (!cookie) throw new Error('login did not set a session cookie for ' + identifier);
  return cookie.split(';')[0];
}
