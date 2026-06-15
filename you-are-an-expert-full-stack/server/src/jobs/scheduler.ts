import cron from 'node-cron';
import '../db/migrate.js';
import { runWeeklyPayouts } from '../routes/payouts.js';

// Runs every Sunday at 23:00 server time. Deploy this process as a worker.
cron.schedule('0 23 * * 0', async () => {
  const payouts = await runWeeklyPayouts();
  console.log(`Weekly payout worker created ${payouts.length} payout(s).`);
});

console.log('RouteShare weekly payout scheduler is running.');
