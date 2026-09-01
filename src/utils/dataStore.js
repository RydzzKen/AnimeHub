// ==========================================
// DATASTORE — active storage backed by SQLite
// Routes keep using this API unchanged; actual reads/writes go through
// utils/database.js (better-sqlite3). The legacy encrypted JSON files are
// only read during the one-time migration on first boot.
// ==========================================
const database = require('./database');

// Migrate legacy encrypted JSON -> SQLite on boot (no-op if already migrated).
database.migrateFromJson();

module.exports = {
    readUsers: database.getAllUsers,
    saveUsers: database.saveUsersList,
    readUser: database.getUsersByUsername,
    readAnime: database.getAllAnime,
    saveAnime: database.saveAnimeList,
    readComments: database.getAllComments,
    saveComments: database.replaceComments,
    readFriends: database.getAllFriends,
    saveFriends: database.saveFriendsList,
    readMessages: database.getAllMessages,
    saveMessages: database.saveMessagesList,
    readBanned: database.getAllBanned,
    saveBanned: database.saveBannedList,
    readPush: database.getPushSubscriptions,
    savePush: database.savePushSubscriptions,
    readSchedule: database.getAllSchedule,
    saveSchedule: database.saveScheduleList,
    setFavorite: database.setFavorite,
    setSubscription: database.setSubscription,
};