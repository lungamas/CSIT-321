/**
 * Database Module for iMark
 * SQLite database with users table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'imark.db');

// Create and configure database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✓ Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        company_name TEXT,
        phone TEXT,
        reset_token TEXT,
        reset_token_expiry INTEGER,
        session_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active INTEGER DEFAULT 1
      )
    `, (err) => {
      if (err) {
        console.error('Error creating users table:', err);
      } else {
        console.log('✓ Users table ready');
        seedDefaultUser();
      }
    });

    // Create login_history table for tracking
    db.run(`
      CREATE TABLE IF NOT EXISTS login_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        success INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, (err) => {
      if (err) {
        console.error('Error creating login_history table:', err);
      } else {
        console.log('✓ Login history table ready');
      }
    });
  });
}

// Seed a default demo user
function seedDefaultUser() {
  const defaultUser = {
    username: 'demo',
    email: 'demo@imark.com',
    password: 'demo123',
    full_name: 'Demo User',
    company_name: 'iMark Demo'
  };

  // Check if demo user exists
  db.get('SELECT id FROM users WHERE email = ?', [defaultUser.email], async (err, row) => {
    if (err) {
      console.error('Error checking for demo user:', err);
      return;
    }
    
    if (!row) {
      // Create demo user
      const passwordHash = await bcrypt.hash(defaultUser.password, 10);
      
      db.run(`
        INSERT INTO users (username, email, password_hash, full_name, company_name)
        VALUES (?, ?, ?, ?, ?)
      `, [
        defaultUser.username,
        defaultUser.email,
        passwordHash,
        defaultUser.full_name,
        defaultUser.company_name
      ], (err) => {
        if (err) {
          console.error('Error creating demo user:', err);
        } else {
          console.log('✓ Demo user created (demo@imark.com / demo123)');
        }
      });
    }
  });
}

// Database helper functions
const dbHelpers = {
  // Get user by email
  getUserByEmail: (email) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Get user by ID
  getUserById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ? AND is_active = 1', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Get user by username
  getUserByUsername: (username) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Get user by reset token
  getUserByResetToken: (token) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE reset_token = ? AND is_active = 1', [token], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Create new user
  createUser: (userData) => {
    return new Promise((resolve, reject) => {
      const { username, email, password_hash, full_name, company_name, phone } = userData;
      
      db.run(`
        INSERT INTO users (username, email, password_hash, full_name, company_name, phone)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [username, email, password_hash, full_name, company_name, phone], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, username, email });
      });
    });
  },

  // Update user
  updateUser: (id, updates) => {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      Object.keys(updates).forEach(key => {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      });
      
      values.push(id);
      
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
      
      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  },

  // Update last login
  updateLastLogin: (id) => {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  },

  // Log login attempt
  logLoginAttempt: (userId, ipAddress, userAgent, success) => {
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO login_history (user_id, ip_address, user_agent, success)
        VALUES (?, ?, ?, ?)
      `, [userId, ipAddress, userAgent, success ? 1 : 0], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  // Get user's login history
  getLoginHistory: (userId, limit = 10) => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM login_history 
        WHERE user_id = ? 
        ORDER BY login_time DESC 
        LIMIT ?
      `, [userId, limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get all users (admin function)
  getAllUsers: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT id, username, email, full_name, company_name, phone, created_at, last_login, is_active FROM users', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

module.exports = { db, ...dbHelpers };
