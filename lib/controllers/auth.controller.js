import jwt from "jsonwebtoken";

const USERS = [
  { id: 1, email: "admin@example.com", password: "admin123", role: "admin" },
  {
    id: 2,
    name: "Confirmation Agent 1",
    email: "confirmation1@example.com",
    password: "confirm123",
    role: "confirmation_team",
  },
  {
    id: 4,
    name: "Confirmation Agent 2",
    email: "confirmation2@example.com",
    password: "confirm123",
    role: "confirmation_team",
  },
  {
    id: 5,
    name: "Confirmation Agent 3",
    email: "confirmation3@example.com",
    password: "confirm123",
    role: "confirmation_team",
  },
  {
    id: 3,
    email: "agent@example.com",
    password: "agent123",
    role: "delivery_agent",
  },
];

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") return null;
  return "dev-store-management-secret";
}

export const login = (req, res) => {
  const { email, password } = req.body;
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    return res.status(500).json({ message: "JWT secret is not configured" });
  }

  const user = USERS.find((u) => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    { expiresIn: "7d" },
  );

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name || "",
      email: user.email,
      role: user.role,
    },
  });
};
