// db.js — SQL Server version
const sql = require('mssql');

const config = {
    server: 'ICON-DC',              // ✅ your server name
    user: 'sa',                   // ✅ your user id
    password: 'IIT_lis@6061',        // ✅ your password
    database: 'Finance_Management',   // ✅ your database
    port: 1433,                   // ✅ default SQL Server port
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