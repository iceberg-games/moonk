// One-time setup for the OWNER account (Colin runs this himself; nobody else knows the password):
//   node server/create-owner.mjs
// Asks for a username and password (typed hidden) and stores a scrypt hash in server/accounts.json.
import readline from 'node:readline';
import * as acc from './accounts.mjs';
function ask(q, hidden = false) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write(''); }; }
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); ok(a); });
  });
}
if (acc.hasOwner() && !process.argv.includes('--force')) { console.log('An owner account already exists. Re-run with --force to add another owner account.'); process.exit(1); }
const name = (process.env.MOONK_OWNER_USER || await ask('Owner username (3-14 chars): ')).trim();
const pw = process.env.MOONK_OWNER_PASS || await ask('Owner password (min 6 chars): ', true);
if (!process.env.MOONK_OWNER_PASS) { const again = await ask('Repeat password: ', true); if (again !== pw) { console.log('Passwords did not match.'); process.exit(1); } }
const r = acc.create(name, pw, { owner: true });
console.log(r.ok ? `Owner account "${r.name}" created. Log in on the in-world terminal to unlock the admin tools.` : `Failed: ${r.err}`);
process.exit(r.ok ? 0 : 1);
