import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config(); // Load variables from .env

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT, 10), // <-- this is important
  database: process.env.DB_ACCOUNT_DB,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const poolAccount = await sql.connect(config);

export default poolAccount;
