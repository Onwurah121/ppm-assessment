require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['1.1.1.1']);

const config = {
    mongodb: {
        url: process.env.MONGODB_URI || 'mongodb://localhost:27017/ppm',
        options: {},
    },
    migrationsDir: 'migrations',
    changelogCollectionName: 'changelog',
    migrationFileExtension: '.js',
    useFileHash: false,
    moduleSystem: 'commonjs',
};

module.exports = config;
