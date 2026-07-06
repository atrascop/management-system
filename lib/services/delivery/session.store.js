import fs from "fs";

const SESSION_FILE = "./shexpress.session.json";

export function saveSession(session) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

export function getSession() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;

    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
  } catch (err) {
    return null;
  }
}

export function clearSession() {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}
