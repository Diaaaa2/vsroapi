import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import sql from "mssql";
import crypto from "crypto";

dotenv.config();

const router = express.Router();

export default function authRoutes(poolAccount) {
  
  // Register endpoint
  router.post("/register", async (req, res) => {
    const { StrUserID, password, email, name } = req.body;
    if (!StrUserID || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    
    try {
      const checkUser = await poolAccount.request()
        .input("StrUserID", sql.VarChar, StrUserID)
        .query("SELECT JID FROM TB_User WHERE StrUserID = @StrUserID");
      
      if (checkUser.recordset.length > 0) {
        return res.status(400).json({ error: "Username already taken" });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await poolAccount.request()
        .input("StrUserID", sql.VarChar, StrUserID)
        .input("password", sql.VarChar, hashedPassword)
        .input("email", sql.VarChar, email || null)
        .input("name", sql.VarChar, name || null)
        .query(`INSERT INTO TB_User (StrUserID, password, Email, Name, Status) VALUES (@StrUserID, @password, @email, @name, 1)`);
      
      res.status(201).json({ message: "Registration successful" });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Login endpoint with MD5 fallback and bcrypt rehash
  router.post("/login", async (req, res) => {
    const { StrUserID, password } = req.body;
    if (!StrUserID || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    
    try {
      const userResult = await poolAccount.request()
        .input("StrUserID", sql.VarChar, StrUserID)
        .query(`SELECT JID, StrUserID, password, Status, GMrank FROM TB_User WHERE StrUserID = @StrUserID`);
      
      const user = userResult.recordset[0];
      if (!user) {
        return res.status(400).json({ error: "Invalid username or password" });
      }
      
      // MD5 hash of input password
      const md5Hash = crypto.createHash("md5").update(password).digest("hex");

      if (user.password === md5Hash) {
        // Password matches MD5, rehash with bcrypt
        const newHashed = await bcrypt.hash(password, 10);
        await poolAccount.request()
          .input("password", sql.VarChar, newHashed)
          .input("JID", sql.Int, user.JID)
          .query("UPDATE TB_User SET password = @password WHERE JID = @JID");
      } else {
        // Check bcrypt password
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
          return res.status(400).json({ error: "Invalid username or password" });
        }
      }
      
      if (user.Status !== 1) {
        return res.status(403).json({ error: "Account is disabled or inactive" });
      }
      
      const token = jwt.sign(
        { userId: user.JID, username: user.StrUserID, gmRank: user.GMrank },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      
      res.json({ token });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Change password endpoint
  router.post("/change-password", authenticateToken, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old and new passwords required" });
    }
    
    try {
      const userId = req.user.userId;
      const userResult = await poolAccount.request()
        .input("JID", sql.Int, userId)
        .query("SELECT password FROM TB_User WHERE JID = @JID");
      
      const user = userResult.recordset[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      
      const match = await bcrypt.compare(oldPassword, user.password);
      if (!match) return res.status(400).json({ error: "Old password incorrect" });
      
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      await poolAccount.request()
        .input("JID", sql.Int, userId)
        .input("password", sql.VarChar, hashedNewPassword)
        .query("UPDATE TB_User SET password = @password WHERE JID = @JID");
      
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Middleware to verify token
  function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token required" });
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: "Invalid token" });
      req.user = user;
      next();
    });
  }

  return router;
}
