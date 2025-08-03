import express from "express";

const router = express.Router();

export default (poolShard) => {
  // Get full character details
  router.get("/:id/details", async (req, res) => {
    const charID = parseInt(req.params.id, 10);

    try {
      const result = await poolShard.request()
        .input("CharID", charID)
        .query(`
          SELECT 
            c.CharID,
            c.CharName16,
            c.CurLevel,
            c.MaxHP,
            c.MaxMP,
            c.Strength,
            c.Intellect,
            inv.Slot AS ItemSlot,
            inv.RefItemID,
            itemOpt.OptLevel,
            itemBlue.VarType,
            itemBlue.VarValue,
            refObj.CodeName128 AS ItemCodeName
          FROM _Char c
          LEFT JOIN _Inventory inv ON inv.CharID = c.CharID AND inv.Slot >= 0 AND inv.Slot <= 12
          LEFT JOIN _Items itm ON itm.ID64 = inv.ItemID
          LEFT JOIN _RefObjCommon refObj ON itm.RefItemID = refObj.ID
          LEFT JOIN _ItemOptLevel itemOpt ON itm.OptLevel = itemOpt.OptLevel
          LEFT JOIN _ItemVar itemBlue ON itm.ID64 = itemBlue.ID64
          WHERE c.CharID = @CharID
        `);

      const details = result.recordset;

      if (details.length === 0) {
        return res.status(404).json({ error: "Character not found." });
      }

      // Group items by slot
      const char = {
        CharID: details[0].CharID,
        CharName16: details[0].CharName16,
        CurLevel: details[0].CurLevel,
        MaxHP: details[0].MaxHP,
        MaxMP: details[0].MaxMP,
        Strength: details[0].Strength,
        Intellect: details[0].Intellect,
        Equipment: [],
      };

      const equipmentMap = {};

      for (const row of details) {
        if (row.ItemSlot !== null && !equipmentMap[row.ItemSlot]) {
          equipmentMap[row.ItemSlot] = {
            Slot: row.ItemSlot,
            RefItemID: row.RefItemID,
            CodeName: row.ItemCodeName,
            OptLevel: row.OptLevel || 0,
            Blues: [],
          };
        }

        if (equipmentMap[row.ItemSlot] && row.VarType !== null) {
          equipmentMap[row.ItemSlot].Blues.push({
            Type: row.VarType,
            Value: row.VarValue,
          });
        }
      }

      char.Equipment = Object.values(equipmentMap);

      res.json(char);

    } catch (err) {
      console.error("Character fetch error:", err);
      res.status(500).json({ error: "Failed to fetch character details." });
    }
  });

  return router;
};
