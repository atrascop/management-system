import jwt from "jsonwebtoken";

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") return null;
  return "dev-store-management-secret";
}

export function verifyToken(req, res, next) {
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    return res.status(500).json({ error: "JWT secret is not configured" });
  }

  const header = req.headers.authorization;

  if (!header) {
    if (process.env.NODE_ENV !== "production") {
      req.user = {
        id: "dev",
        email: "dev@local",
        role: "admin",
        source: "dev-auth-bypass",
      };
      return next();
    }

    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export const authMiddleware = verifyToken;
