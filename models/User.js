const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
    static create(userData, callback) {
        const { name, age, email, password } = userData;
        
        bcrypt.hash(password, 12, (err, hashedPassword) => {
            if (err) return callback(err);
            
            const sql = `INSERT INTO users (name, age, email, password) 
                         VALUES (?, ?, ?, ?)`;
            
            db.run(sql, [name, age, email, hashedPassword], function(err) {
                if (err) return callback(err);
                
                // Get the inserted user
                User.findById(this.lastID, (err, user) => {
                    callback(err, user);
                });
            });
        });
    }

    static findByEmail(email, callback) {
        const sql = `SELECT * FROM users WHERE email = ?`;
        db.get(sql, [email], (err, row) => {
            callback(err, row);
        });
    }

    static findById(id, callback) {
        const sql = `SELECT * FROM users WHERE id = ?`;
        db.get(sql, [id], (err, row) => {
            callback(err, row);
        });
    }

    static updateSearches(userId, searches, callback) {
        const sql = `UPDATE users SET searchesThisWeek = ? WHERE id = ?`;
        db.run(sql, [searches, userId], callback);
    }

    static canSearch(user, callback) {
        const now = new Date();
        const lastReset = new Date(user.lastSearchReset);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        if (lastReset < weekAgo) {
            // Reset search count
            User.updateSearches(user.id, 0, (err) => {
                if (err) return callback(err);
                user.searchesThisWeek = 0;
                callback(null, user.subscription === 'premium' || user.searchesThisWeek < 10);
            });
        } else {
            callback(null, user.subscription === 'premium' || user.searchesThisWeek < 10);
        }
    }

    static comparePassword(candidatePassword, hashedPassword, callback) {
        bcrypt.compare(candidatePassword, hashedPassword, (err, isMatch) => {
            callback(err, isMatch);
        });
    }
}

module.exports = User;