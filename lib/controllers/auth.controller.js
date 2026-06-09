import jwt from "jsonwebtoken";

const USERS = [
  { id: 1, email: "admin@example.com", password: "admin123", role: "admin" },
  {
    id: 2,
    email: "confirmation@example.com",
    password: "confirm123",
    role: "confirmation",
  },
  { id: 3, email: "agent@example.com", password: "agent123", role: "agent" },
];

export const login = (req, res) => {
  const { email, password } = req.body;

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
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

  return res.json({
    token,
    user: {
      email: user.email,
      role: user.role,
    },
  });
};
