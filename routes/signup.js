import express from "express";
import sql from "mssql";
import crypto from "crypto";

const router = express.Router();

export default function (poolAccount) {
  router.post("/", async (req, res) => {
    const { StrUserID, Password, Email } = req.body;

    if (!StrUserID || !Password || !Email) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    try {
      // Hash the password with MD5
      const hashedPassword = crypto.createHash("md5").update(Password).digest("hex");

      // Check if username or email already exists
      const checkResult = await poolAccount
        .request()
        .input("StrUserID", sql.VarChar(25), StrUserID)
        .input("Email", sql.VarChar(128), Email)
        .query(`
          SELECT StrUserID, Email FROM TB_User 
          WHERE StrUserID = @StrUserID OR Email = @Email
        `);

      if (checkResult.recordset.length > 0) {
        const existing = checkResult.recordset[0];
        if (existing.StrUserID === StrUserID) {
          return res.status(409).json({ field: "username", message: "Username already exists." });
        }
        if (existing.Email === Email) {
          return res.status(409).json({ field: "email", message: "Email is already registered." });
        }
      }

      // Insert the new user
      await poolAccount
        .request()
        .input("StrUserID", sql.VarChar(25), StrUserID)
        .input("Password", sql.VarChar(64), hashedPassword)
        .input("Email", sql.VarChar(128), Email)
        .query(`
          INSERT INTO TB_User (StrUserID, password, Email, sec_primary, sec_content)
          VALUES (@StrUserID, @Password, @Email, 1, 1)
        `);

      res.status(201).json({ message: "User registered successfully." });
    } catch (err) {
      console.error("Signup error:", err);
      res.status(500).json({ message: "Internal server error.", error: err.message });
    }
  });

  return router;
}
