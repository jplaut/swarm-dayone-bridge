import dotenv from 'dotenv';
import { DayOneClient } from './dayone.js';
import { loadState, saveState, formatCheckinForDayOne } from './swarm-utils.js';

dotenv.config();

const SWARM_ACCESS_TOKEN = process.env.SWARM_ACCESS_TOKEN;
const JOURNAL_NAME = process.env.DAYONE_JOURNAL_NAME || null;

class SwarmSync {
  constructor() {
    this.dayOne = new DayOneClient(JOURNAL_NAME);
    this.state = { lastCheckinId: null, lastSyncTimestamp: null, failedCheckins: [] };
  }

  async fetchRecentCheckins(limit = 250, afterTimestamp = null) {
    if (!SWARM_ACCESS_TOKEN) {
      throw new Error('SWARM_ACCESS_TOKEN not set in environment variables');
    }

    const version = '20231201';
    let url = `https://api.foursquare.com/v2/users/self/checkins?limit=${limit}&v=${version}`;

    if (afterTimestamp) {
      url += `&afterTimestamp=${afterTimestamp}`;
      console.log(`Fetching checkins since ${new Date(afterTimestamp * 1000).toLocaleString()}...`);
    } else {
      console.log('Fetching recent checkins from Swarm...');
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${SWARM_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Swarm API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.meta.code !== 200) {
      throw new Error(`Swarm API returned error: ${data.meta.errorDetail || 'Unknown error'}`);
    }

    return data.response.checkins.items;
  }

  async syncCheckins() {
    console.log(`\n🕐 Starting Swarm sync at ${new Date().toLocaleString()}`);

    this.state = await loadState();
    const lastSync = this.state.lastSyncTimestamp 
      ? new Date(this.state.lastSyncTimestamp).toLocaleString()
      : 'never';
    const lastId = this.state.lastCheckinId || 'none';
    console.log(`Loaded state: last sync at ${lastSync}, last checkin ID: ${lastId}`);

    const cliAvailable = await this.dayOne.checkCLIAvailable();
    if (!cliAvailable) {
      throw new Error('Day One CLI not found. Please install Day One app and CLI.');
    }

    // Calculate afterTimestamp from last sync (if available)
    let afterTimestamp = null;
    if (this.state.lastSyncTimestamp) {
      afterTimestamp = Math.floor(new Date(this.state.lastSyncTimestamp).getTime() / 1000);
    }

    const checkins = await this.fetchRecentCheckins(250, afterTimestamp);

    if (checkins.length === 0) {
      console.log('No new checkins found.\n');
      this.state.lastSyncTimestamp = new Date().toISOString();
      await saveState(this.state);
      return;
    }

    console.log(`Found ${checkins.length} checkin${checkins.length > 1 ? 's' : ''} since last sync\n`);

    // Sort by date (oldest first) so entries are created in chronological order
    checkins.sort((a, b) => a.createdAt - b.createdAt);

    let newCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const checkin of checkins) {
      const checkinId = checkin.id;

      // Skip if this is the last checkin we already processed
      if (this.state.lastCheckinId === checkinId) {
        skippedCount++;
        continue;
      }

      try {
        const entryData = await formatCheckinForDayOne(checkin);
        const date = new Date(checkin.createdAt * 1000).toLocaleDateString();
        console.log(`Creating entry for: ${checkin.venue.name} (${date})`);

        await this.dayOne.createEntry(entryData);

        // Update state with this checkin
        this.state.lastCheckinId = checkinId;
        this.state.lastSyncTimestamp = new Date(checkin.createdAt * 1000).toISOString();
        newCount++;

        // Save state after each entry in case of interruption
        await saveState(this.state);
        console.log('State saved');

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error creating entry for ${checkin.venue.name}:`, error.message);
        errorCount++;

        // Track failed checkin for retry
        if (!this.state.failedCheckins) {
          this.state.failedCheckins = [];
        }
        if (!this.state.failedCheckins.find(f => f.id === checkinId)) {
          this.state.failedCheckins.push({
            id: checkinId,
            venueName: checkin.venue.name,
            createdAt: checkin.createdAt,
            error: error.message,
            failedAt: new Date().toISOString()
          });
          await saveState(this.state);
        }
      }
    }

    console.log('\n--- Sync Complete ---');
    if (newCount === 0 && skippedCount > 0) {
      console.log(`No new checkins since last sync (${skippedCount} already processed)`);
    } else {
      console.log(`New entries created: ${newCount}`);
      if (skippedCount > 0) {
        console.log(`Already processed: ${skippedCount}`);
      }
    }
    if (errorCount > 0) {
      console.log(`Errors: ${errorCount}`);
      console.log(`Failed checkins tracked: ${this.state.failedCheckins.length}`);
    }
  }
}

async function main() {
  try {
    const sync = new SwarmSync();
    await sync.syncCheckins();
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  }
}

main();
