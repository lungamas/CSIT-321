/**
 * View Database Contents
 * Simple script to display users and login history from the database
 */

const { db, getAllUsers, getLoginHistory } = require('./database');

async function viewDatabase() {
  try {
    console.log('\n========== USERS TABLE ==========');
    const users = await getAllUsers();
    
    if (users.length === 0) {
      console.log('No users found.');
    } else {
      users.forEach(user => {
        console.log(`\nID: ${user.id}`);
        console.log(`  Username: ${user.username}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  Full Name: ${user.full_name || 'N/A'}`);
        console.log(`  Company: ${user.company_name || 'N/A'}`);
        console.log(`  Phone: ${user.phone || 'N/A'}`);
        console.log(`  Created: ${user.created_at}`);
        console.log(`  Last Login: ${user.last_login || 'Never'}`);
        console.log(`  Active: ${user.is_active ? 'Yes' : 'No'}`);
      });
    }
    
    console.log('\n\n========== LOGIN HISTORY ==========');
    for (const user of users) {
      const history = await getLoginHistory(user.id, 5);
      if (history.length > 0) {
        console.log(`\n${user.email}:`);
        history.forEach((entry, i) => {
          console.log(`  ${i + 1}. ${entry.login_time} - ${entry.success ? 'Success' : 'Failed'}`);
          console.log(`     IP: ${entry.ip_address || 'N/A'}`);
        });
      }
    }
    
    console.log('\n');
    db.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    db.close();
    process.exit(1);
  }
}

// Wait a bit for database to initialize
setTimeout(viewDatabase, 1000);
