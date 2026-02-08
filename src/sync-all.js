import dotenv from 'dotenv';
import { DayOneClient } from './dayone.js';
import { loadState, saveState, formatCheckinForDayOne } from './swarm-utils.js';

dotenv.config();

const SWARM_ACCESS_TOKEN = process.env.SWARM_ACCESS_TOKEN;
const JOURNAL_NAME = process.env.DAYONE_JOURNAL_NAME || null;

class SwarmFullSync {
  constructor() {
    this.dayOne = new DayOneClient(JOURNAL_NAME);
    this.state = { lastCheckinId: null, lastSyncTimestamp: null, failedCheckins: [] };
  }

  async fetchAllCheckins() {
    if (!SWARM_ACCESS_TOKEN) {
      throw new Error('SWARM_ACCESS_TOKEN not set in environment variables');
    }

    const version = '20231201';
    const limit = 250; // Max allowed by API
    let offset = 0;
    let allCheckins = [];
    let hasMore = true;

    console.log('Fetching all checkins from Swarm...\n');

    while (hasMore) {
      const url = `https://api.foursquare.com/v2/users/self/checkins?limit=${limit}&offset=${offset}&v=${version}`;

      console.log(`Fetching checkins ${offset + 1} to ${offset + limit}...`);

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

      const checkins = data.response.checkins.items;

      if (checkins.length === 0) {
        hasMore = false;
      } else {
        allCheckins = allCheckins.concat(checkins);
        offset += checkins.length;

        // If we got fewer than the limit, we've reached the end
        if (checkins.length < limit) {
          hasMore = false;
        }

        // Add a small delay to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n✓ Fetched ${allCheckins.length} total checkins\n`);
    return allCheckins;
  }

  async syncAllCheckins() {
    console.log('🔄 Starting FULL Swarm to Day One sync...\n');
    console.log('⚠️  This will sync ALL your Swarm checkins (may take a while)\n');

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

    const allCheckins = await this.fetchAllCheckins();

    // Sort by date (oldest first) so entries are created in chronological order
    allCheckins.sort((a, b) => a.createdAt - b.createdAt);

    let newCount = 0;
    let errorCount = 0;

    console.log('Creating Day One entries...\n');
    console.log('─'.repeat(60));

    for (let i = 0; i < allCheckins.length; i++) {
      const checkin = allCheckins[i];
      const checkinId = checkin.id;
      const progress = `[${i + 1}/${allCheckins.length}]`;

      // Skip if this is the last checkin we already processed
      if (this.state.lastCheckinId === checkinId) {
        console.log(`${progress} ⏭️  Already synced: ${checkin.venue.name}`);
        continue;
      }

      try {
        const entryData = await formatCheckinForDayOne(checkin);
        const date = new Date(checkin.createdAt * 1000).toLocaleDateString();
        console.log(`${progress} ✓ Creating: ${checkin.venue.name} (${date})`);

        await this.dayOne.createEntry(entryData);

        // Update state with this checkin
        this.state.lastCheckinId = checkinId;
        this.state.lastSyncTimestamp = new Date(checkin.createdAt * 1000).toISOString();
        newCount++;

        // Save state after each entry in case of interruption
        await saveState(this.state);

        // Rate limiting: wait between entries
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`${progress} ❌ Error: ${checkin.venue.name} - ${error.message}`);
        errorCount++;

        // Track failed checkin for retry
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

    console.log('─'.repeat(60));
    console.log('\n✅ Full Sync Complete!\n');
    console.log(`📊 Summary:`);
    console.log(`   New entries created: ${newCount}`);
    if (errorCount > 0) {
      console.log(`   Errors: ${errorCount}`);
      console.log(`   Failed checkins tracked: ${this.state.failedCheckins.length}`);
    }
    console.log(`   Total checkins: ${allCheckins.length}`);
  }
}

async function main() {
  try {
    const sync = new SwarmFullSync();
    await sync.syncAllCheckins();
  } catch (error) {
    console.error('\n❌ Full sync failed:', error.message);
    process.exit(1);
  }
}

main();
