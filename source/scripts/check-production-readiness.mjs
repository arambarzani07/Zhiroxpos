import fs from 'node:fs';

const checks = [
  ['src/stores/authStore.ts', ['MOCK_USERS', "password === '123456'", 'validatePassword', 'passwordHash', 'passwordSalt', 'credentials:']],
  ['src/pages/Login.tsx', ['Demo Credentials', "setPassword('123456')", 'placeholder="123456"']],
  ['src/stores/dataStore.ts', ['Initial Mock Data', 'INITIAL_PRODUCTS', 'INITIAL_CUSTOMERS']],
];
let failed = false;
for (const [file, forbidden] of checks) {
  const content = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const token of forbidden) {
    if (content.includes(token)) {
      console.error(`PRODUCTION BLOCKER: ${token} found in ${file}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log('Production readiness gate passed: no demo credentials or seeded business data in critical stores.');
