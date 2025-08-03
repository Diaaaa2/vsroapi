import express from "express";
import sql from "mssql";
import crypto from "crypto";

const router = express.Router();

export default function (poolAccount) {
  router.post("/", async (req, res) => {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: "Missing username/email or password." });
    }

    try {
      // Hash password with MD5 (same as signup)
      const hashedPassword = crypto.createHash("md5").update(password).digest("hex");

      // Query user by username or email and password
      const result = await poolAccount
        .request()
        .input("usernameOrEmail", sql.VarChar(128), usernameOrEmail)
        .input("hashedPassword", sql.VarChar(64), hashedPassword)
        .query(`
          SELECT StrUserID, Email
          FROM TB_User
          WHERE (StrUserID = @usernameOrEmail OR Email = @usernameOrEmail)
            AND password = @hashedPassword
        `);

      if (result.recordset.length === 0) {
        return res.status(401).json({ message: "Invalid username/email or password." });
      }

      // Login success - you can later add JWT token here
      return res.status(200).json({ message: "Login successful.", user: result.recordset[0] });

    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Internal server error." });
    }
  });

  return router;
}
