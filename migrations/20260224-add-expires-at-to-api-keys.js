module.exports = {
    async up(db) {
        // Add expiresAt field to all API key documents that don't have it
        // Setting to null means "no expiration" — backward compatible
        await db.collection('apikeys').updateMany(
            { expiresAt: { $exists: false } },
            { $set: { expiresAt: null } },
        );

        console.log('Migration UP: Added expiresAt field to all API key documents');
    },

    async down(db) {
        // Remove the expiresAt field from all API key documents
        await db.collection('apikeys').updateMany(
            {},
            { $unset: { expiresAt: '' } },
        );

        console.log('Migration DOWN: Removed expiresAt field from all API key documents');
    },
};
