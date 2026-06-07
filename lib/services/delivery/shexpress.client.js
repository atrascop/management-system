import axios from "axios";
import {
  setSession,
  getSession,
  isSessionValid,
  clearSession,
} from "./session.store.js";

const BASE_URL = "https://shexpress.ma"; // adjust if needed

/**
 * LOGIN (stores session cookies)
 */
export async function login() {
  const email = process.env.SHEXPRESS_EMAIL;
  const password = process.env.SHEXPRESS_PASSWORD;

  const res = await axios.post(
    `${BASE_URL}/login`,
    {
      email,
      password,
    },
    {
      withCredentials: true,
    },
  );

  const cookies = res.headers["set-cookie"];

  setSession({
    cookies,
    expiresAt: Date.now() + 1000 * 60 * 30, // 30 min session
  });

  return true;
}

/**
 * Ensure session exists
 */
export async function ensureSession() {
  if (isSessionValid()) return;

  console.log("🔐 Shexpress session expired → re-login");
  clearSession();
  await login();
}

/**
 * GET request with session
 */
export async function request(path, options = {}) {
  await ensureSession();

  const session = getSession();

  return axios({
    url: `${BASE_URL}${path}`,
    method: options.method || "GET",
    data: options.data,
    headers: {
      Cookie: session.cookies?.join("; "),
      ...options.headers,
    },
  });
}
