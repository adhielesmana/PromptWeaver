import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import type { User, UserRole } from "@shared/schema";
import session from "express-session";

const router = Router();

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: string;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  session: session.Session & Partial<session.SessionData>;
}

const SUPERADMIN_USERNAME = "adhielesmana";
const DEFAULT_PASSWORD = "admin123";

export async function initializeSuperAdmin() {
  try {
    const existing = await storage.getUserByUsername(SUPERADMIN_USERNAME);
    if (!existing) {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      await storage.createUser({
        username: SUPERADMIN_USERNAME,
        password: passwordHash,
        role: "superadmin",
      });
      console.log("⚠️  SECURITY WARNING: Superadmin user created with default password!");
      console.log("⚠️  Please change the password immediately via Admin Dashboard!");
      console.log("⚠️  Default credentials: adhielesmana / admin123");
    } else if (existing.role !== "superadmin") {
      await storage.updateUser(existing.id, { role: "superadmin" });
      console.log("Superadmin role restored for user: adhielesmana");
    }
  } catch (error) {
    console.error("Failed to initialize superadmin:", error);
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.session.userRole as UserRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role as UserRole;

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ success: true });
  });
});

router.get("/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const user = await storage.getUser(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
  });
});

router.get("/users", requireRole("superadmin", "admin"), async (req, res) => {
  try {
    const users = await storage.getAllUsers();
    res.json(users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
    })));
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users", requireRole("superadmin", "admin"), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const currentRole = req.session.userRole;
    if (role === "superadmin" && currentRole !== "superadmin") {
      return res.status(403).json({ error: "Only superadmin can create superadmin users" });
    }

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await storage.createUser({
      username,
      password: hashedPassword,
      role: role || "user",
    });

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:id", requireRole("superadmin", "admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;
    
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentRole = req.session.userRole;
    if (user.role === "superadmin" && currentRole !== "superadmin") {
      return res.status(403).json({ error: "Cannot modify superadmin user" });
    }

    if (role === "superadmin" && currentRole !== "superadmin") {
      return res.status(403).json({ error: "Only superadmin can assign superadmin role" });
    }

    const updates: Partial<User> = {};
    if (username) updates.username = username;
    if (password) updates.password = await bcrypt.hash(password, 10);
    if (role) updates.role = role;

    const updated = await storage.updateUser(id, updates);
    res.json({
      id: updated.id,
      username: updated.username,
      role: updated.role,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", requireRole("superadmin"), async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.username === SUPERADMIN_USERNAME) {
      return res.status(403).json({ error: "Cannot delete the superadmin user" });
    }

    await storage.deleteUser(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/settings", requireRole("superadmin", "admin"), async (req, res) => {
  try {
    const settings = await storage.getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.post("/settings", requireRole("superadmin", "admin"), async (req, res) => {
  try {
    const { key, value, description } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: "Key and value required" });
    }

    const setting = await storage.setSetting(key, value, description);
    res.json(setting);
  } catch (error) {
    console.error("Error saving setting:", error);
    res.status(500).json({ error: "Failed to save setting" });
  }
});

router.delete("/settings/:key", requireRole("superadmin"), async (req, res) => {
  try {
    const { key } = req.params;
    await storage.deleteSetting(key);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting setting:", error);
    res.status(500).json({ error: "Failed to delete setting" });
  }
});

export default router;
