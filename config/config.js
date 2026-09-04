require('dotenv').config();

const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const DB_SERVER = process.env.DB_SERVER;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_DATABASE = process.env.DB_DATABASE;
const DB_PORT = Number(process.env.DB_PORT) || 1433;

module.exports = {
    BASE_URL,
    PORT,
    JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET,
    DB_SERVER,
    DB_USER,
    DB_PASSWORD,
    DB_DATABASE,
    DB_PORT,
};