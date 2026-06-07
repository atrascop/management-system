let session = {
  cookies: null,
  expiresAt: null,
};

export function setSession(data) {
  session = {
    cookies: data.cookies,
    expiresAt: data.expiresAt,
  };
}

export function getSession() {
  return session;
}

export function isSessionValid() {
  if (!session.cookies || !session.expiresAt) return false;
  return Date.now() < session.expiresAt;
}

export function clearSession() {
  session = { cookies: null, expiresAt: null };
}
