import '../db/migrate.js';
import { runWeeklyPayouts } from '../routes/payouts.js';

const payouts = await runWeeklyPayouts();
console.log(`Created ${payouts.length} weekly payout(s).`);
