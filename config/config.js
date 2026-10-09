const path = require('path');
const dotenv = require('dotenv');


// Used when running locally with npm run dev.
// Existing IIS environment variables are NOT overwritten.
dotenv.config({
    path: path.resolve(__dirname, '../.env'),
});


const config = {

    // IMPORTANT:
    // Do NOT convert PORT to Number.
    PORT: process.env.PORT || 1024,

    BASE_URL:
        process.env.BASE_URL,

    JWT_ACCESS_SECRET:
        process.env.JWT_ACCESS_SECRET,

    JWT_REFRESH_SECRET:
        process.env.JWT_REFRESH_SECRET,

    DB_SERVER:
        process.env.DB_SERVER,

    DB_USER:
        process.env.DB_USER,

    DB_PASSWORD:
        process.env.DB_PASSWORD,

    DB_DATABASE:
        process.env.DB_DATABASE,

    DB_PORT:
        Number(process.env.DB_PORT) || 1433,
};


// Validate only application configuration.
// PORT is intentionally not validated here.
const requiredVariables = [

    'BASE_URL',

    'JWT_ACCESS_SECRET',

    'JWT_REFRESH_SECRET',

    'DB_SERVER',

    'DB_USER',

    'DB_PASSWORD',

    'DB_DATABASE',

];


for (const key of requiredVariables) {

    if (!config[key]) {

        throw new Error(
            `Missing environment variable: ${key}`
        );

    }

}


module.exports = config;