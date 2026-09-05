// db.js — SQL Server version
const sql = require('mssql');
const {
    DB_SERVER,
    DB_USER,
    DB_PASSWORD,
    DB_DATABASE,
    DB_PORT,
} = require('./config/config');


const config = {
    server: DB_SERVER,              // ✅ your server name
    user: DB_USER,                   // ✅ your user id
    password: DB_PASSWORD,        // ✅ your password
    database: DB_DATABASE,   // ✅ your database
    port: DB_PORT,                   // ✅ default SQL Server port
    options: {
        encrypt: false,  // ✅ false for local network
        trustServerCertificate: true,   // ✅ required for SQL Server
        enableArithAbort: true,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

// ✅ Connect and export
const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ SQL Server connected successfully');
        return pool;
    })
    .catch(err => {
        console.log('❌ SQL Server connection failed:', err.message);
    });

module.exports = { sql, poolPromise };