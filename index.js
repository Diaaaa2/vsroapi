import express from "express";
import sql from "mssql";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import characterRoutes from "./routes/character.js";
import authRoutes from "./routes/auth.js";
import signupRoutes from "./routes/signup.js";
import loginRoutes from "./routes/login.js";

dotenv.config();

const port = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const configCommon = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT, 10),  // add this line for port
  options: {
    trustServerCertificate: process.env.DB_TRUST_CERT === "true",
  },
};


const poolAccount = new sql.ConnectionPool({
  ...configCommon,
  database: process.env.DB_DATABASE_SRO,
});

const poolVPlus = new sql.ConnectionPool({
  ...configCommon,
  database: process.env.DB_DATABASE_VPLUS,
});

const poolShard = new sql.ConnectionPool({
  ...configCommon,
  database: process.env.DB_DATABASE_SHARD,
});

let poolsReady = false;

async function initPools() {
  try {
    await poolAccount.connect();
    await poolVPlus.connect();
    await poolShard.connect();
    console.log("✅ Connected to all databases");
    poolsReady = true;   // <-- You need this to let your middleware pass requests!
// Register character route with shard DB
app.use("/api/character", characterRoutes(poolShard));
app.use("/api/signup", signupRoutes(poolAccount));
app.use("/api/login", loginRoutes(poolAccount));


    // Now start the server after DB connections are ready
app.listen(port, () => {
  console.log(`🚀 API server started on http://localhost:${port}`);
});
  } catch (err) {
    console.error("❌ DB connection failed:", err);
  }
}

initPools();

// Middleware to block requests until DB pools are ready
app.use((req, res, next) => {
  if (!poolsReady) {
    return res.status(503).json({ error: "Database not connected yet" });
  }
  next();
});
/*
app.listen(3000, () => {
  console.log("🚀 API server started on http://localhost:3000");
});
*/
//Test API
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!" });
});
//Get Server Time
app.get("/api/status/server-time", async (req, res) => {
  try {
    const result = await poolShard.request().query("SELECT GETDATE() AS serverTime");
    res.json({ serverTime: result.recordset[0].serverTime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//Get Top Players
app.get("/api/players/top", async (req, res) => {
  try {
    const result = await poolShard.request()
      .query("SELECT TOP 10 CharID, CharName16, CurLevel,ItemPoints FROM _Char ORDER BY ItemPoints DESC");
    res.json({ topPlayers: result.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//Get Top Guild
app.get("/api/guilds/top", async (req, res) => {
  try {
    const result = await poolShard.request()
      .query(`SELECT TOP 10 id, name, lvl,ItemPoints FROM _Guild ORDER BY ItemPoints DESC`);
    res.json({ topGuilds: result.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//Get Online Players
app.get("/api/status/online-players", async (req, res) => {
  try {
    const result = await poolVPlus.request()
      .query("SELECT COUNT(*) AS onlineCount FROM _OnlinePlayers");
    res.json({ onlinePlayers: result.recordset[0].onlineCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Get Char Items
// Character details endpoint
app.get("/api/characters/:id", async (req, res) => {
  const charId = req.params.id;
  try {
    const request = poolShard.request();
    request.input("charId", sql.Int, charId);

    const characterQuery = `
      SELECT 
        CharID,
        CharName16,
        CurLevel,
        Strength,
        Intellect,
        HP AS HP,
        MP AS MP,
        InventorySize,
        LatestRegion,
        PosX,
        PosY,
        PosZ
      FROM _Char
      WHERE CharID = @charId
    `;

    const charResult = await request.query(characterQuery);
    if (charResult.recordset.length === 0) {
      return res.status(404).json({ error: "Character not found." });
    }
    const character = charResult.recordset[0];
const guildQuery = `
  SELECT ID, Name, Lvl, ItemPoints
  FROM _Guild
  WHERE ID = (SELECT GuildID FROM _Char WHERE CharID = @charId)
`;
const guildResult = await request.query(guildQuery);
const guild = guildResult.recordset.length > 0 ? guildResult.recordset[0] : null;

    const requestEquip = poolShard.request();
    requestEquip.input("charId", sql.Int, charId);
    const equipmentResult = await requestEquip.query(`
      SELECT i.Slot, i.ItemID, itm.RefItemID, itm.OptLevel, itm.Variance, itm.MagParam1, itm.MagParam2, itm.MagParam3
      FROM _Inventory i
      LEFT JOIN _Items itm ON i.ItemID = itm.ID64
      WHERE i.CharID = @charId AND i.Slot < 13
    `);

    const requestAvatar = poolShard.request();
    requestAvatar.input("charId", sql.Int, charId);
    const avatarResult = await requestAvatar.query(`
      SELECT i.Slot, i.ItemID, itm.RefItemID, itm.OptLevel, itm.Variance, itm.MagParam1, itm.MagParam2, itm.MagParam3
      FROM _Inventory i
      LEFT JOIN _Items itm ON i.ItemID = itm.ID64
      WHERE i.CharID = @charId AND i.Slot BETWEEN 180 AND 199
    `);

    res.json({
      character,
	  guild,
      equipment: equipmentResult.recordset,
      avatar: avatarResult.recordset,
    });

  } catch (err) {
    console.error("❌ Character details fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch character details." });
  }
});
//Get Guild data
app.get("/api/guilds/:id", async (req, res) => {
  const guildId = req.params.id;

  try {
    // Get guild basic info
    const guildResult = await poolShard.request()
      .input("guildId", sql.Int, guildId)
      .query(`
        SELECT ID, Name, Lvl, ItemPoints
        FROM _Guild
        WHERE ID = @guildId
      `);

    if (guildResult.recordset.length === 0) {
      return res.status(404).json({ error: "Guild not found." });
    }
    const guild = guildResult.recordset[0];

    // Get guild members
    const membersResult = await poolShard.request()
      .input("guildId", sql.Int, guildId)
      .query(`
        SELECT CharID, CharName, Permission, MemberClass, CharLevel, JoinDate, Contribution, SiegeAuthority
        FROM _GuildMember
        WHERE GuildID = @guildId
        ORDER BY CharName ASC
      `);

    const members = membersResult.recordset;

    // Find master by SiegeAuthority = 1
    const master = members.find(m => m.SiegeAuthority === 1) || null;

    res.json({
      guild: {
        ...guild,
        master: master ? { CharID: master.CharID, CharName: master.CharName } : null,
        members,
      }
    });
  } catch (err) {
    console.error("Guild details fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch guild details." });
  }
});
