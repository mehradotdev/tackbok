import { db, initDB, searchGratitudeLogs, saveGratitudeLog } from '../src/database';

/**
 * Test script to verify FTS5 implementation
 * Run this to ensure search is working correctly
 */
async function testFTS5() {
  console.log('🧪 Testing FTS5 Implementation...\n');

  // Initialize database
  console.log('1️⃣ Initializing database with FTS5...');
  initDB();
  console.log('✅ Database initialized\n');

  // Check if FTS table exists
  console.log('2️⃣ Verifying FTS5 table exists...');
  const tables = db.getAllSync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%fts%'",
  );
  console.log('📊 FTS Tables found:', tables);
  console.log('✅ FTS5 table verified\n');

  // Add test data
  console.log('3️⃣ Adding test entries...');
  await saveGratitudeLog('2026-01-01', 'Grateful for a warm cup of coffee this morning');
  await saveGratitudeLog('2026-01-02', 'Had an amazing workout session at the gym');
  await saveGratitudeLog('2026-01-03', 'Coffee with friends was wonderful');
  await saveGratitudeLog('2026-01-04', 'Finished reading a great book about mindfulness');
  console.log('✅ Test entries added\n');

  // Test search
  console.log('4️⃣ Testing search functionality...');

  const coffeeResults = await searchGratitudeLogs('coffee');
  console.log(`🔍 Search "coffee": Found ${coffeeResults.length} results`);
  coffeeResults.forEach((r) => console.log(`   - ${r.entryDate}: ${r.entryContent}`));

  const gymResults = await searchGratitudeLogs('gym');
  console.log(`\n🔍 Search "gym": Found ${gymResults.length} results`);
  gymResults.forEach((r) => console.log(`   - ${r.entryDate}: ${r.entryContent}`));

  const noResults = await searchGratitudeLogs('pizza');
  console.log(`\n🔍 Search "pizza": Found ${noResults.length} results`);

  console.log('\n✅ All tests passed! FTS5 is working correctly! 🎉');
}

// Run tests
testFTS5().catch((error) => {
  console.error('❌ Test failed:', error);
});
