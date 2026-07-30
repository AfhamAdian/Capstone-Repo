const { connectDatabase } = require('./src/config/db.js');

console.log('Testing database connection...');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

connectDatabase()
  .then(() => {
    console.log('OK - Database connected successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('ERROR - Connection failed:');
    console.error('Message:', err.message);
    console.error('Code:', err.code);
    console.error('Full error:', err);
    process.exit(1);
  });

// Timeout after 5 seconds
setTimeout(() => {
  console.error('TIMEOUT - Database connection took too long');
  process.exit(1);
}, 5000);
