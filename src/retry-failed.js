import dotenv from 'dotenv';
import { DayOneClient } from './dayone.js';
import { loadState, saveState, formatCheckinForDayOne } from './swarm-utils.js';

dotenv.config();

const SWARM_ACCESS_TOKEN = process.env.SWARM_ACCESS_TOKEN;
const JOURNAL_NAME = process.env.DAYONE_JOURNAL_NAME || null;

class RetryFailed {
  constructor() {
    this.dayOne = new DayOneClient(JOURNAL_NAME);
    this.state = { lastCheckinId: null, lastSyncTimestamp: null, failedCheckins: [] };
  }

  async fetchCheckin(checkinId) {
    if (!SWARM_ACCESS_TOKEN) {
      throw new Error('SWARM_ACCESS_TOKEN not set in environment variables');
    }

    const version = '20231201';
    const url = `https://api.foursquare.com/v2/checkins/${checkinId}?oauth_token=${SWARM_ACCESS_TOKEN}&v=${version}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.meta.code !== 200) {
      throw new Error(`Swarm API returned error: ${data.meta.errorDetail || 'Unknown error'}`);
    }

    return data.response.checkin;
  }

  async retryFailed() {
    console.log('🔄 Retrying failed checkins...\n');

    this.state = await loadState();
    console.log(`Loaded state: ${this.state.failedCheckins.length} failed checkins to retry\n`);

    if (this.state.failedCheckins.length === 0) {
      console.log('✅ No failed checkins to retry!\n');
      return;
    }

    const cliAvailable = await this.dayOne.checkCLIAvailable();
    if (!cliAvailable) {
      throw new Error('Day One CLI not found. Please install Day One app and CLI.');
    }

    let successCount = 0;
    let stillFailedCount = 0;
    const stillFailed = [];

    console.log('─'.repeat(60));

    for (let i = 0; i < this.state.failedCheckins.length; i++) {
      const failedCheckin = this.state.failedCheckins[i];
      const progress = `[${i + 1}/${this.state.failedCheckins.length}]`;

      try {
        console.log(`${progress} Fetching: ${failedCheckin.venueName}...`);
        const checkin = await this.fetchCheckin(failedCheckin.id);

        const entryData = await formatCheckinForDayOne(checkin);
        const date = new Date(checkin.createdAt * 1000).toLocaleDateString();

        console.log(`${progress} ✓ Creating: ${checkin.venue.name} (${date})`);
        await this.dayOne.createEntry(entryData);

        successCount++;

        // Wait between entries
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`${progress} ❌ Still failing: ${failedCheckin.venueName} - ${error.message}`);
        stillFailedCount++;

        // Keep in failed list with updated error
        stillFailed.push({
          ...failedCheckin,
          error: error.message,
          lastRetryAt: new Date().toISOString()
        });
      }
    }

    // Update state with only the still-failed checkins
    this.state.failedCheckins = stillFailed;
    await saveState(this.state);

    console.log('─'.repeat(60));
    console.log('\n✅ Retry Complete!\n');
    console.log(`📊 Summary:`);
    console.log(`   Successfully created: ${successCount}`);
    console.log(`   Still failing: ${stillFailedCount}`);

    if (stillFailedCount > 0) {
      console.log(`\n⚠️  ${stillFailedCount} checkin${stillFailedCount > 1 ? 's' : ''} still failed. Run this script again to retry.`);
    }
  }
}

async function main() {
  try {
    const retry = new RetryFailed();
    await retry.retryFailed();
  } catch (error) {
    console.error('\n❌ Retry failed:', error.message);
    process.exit(1);
  }
}

main();
