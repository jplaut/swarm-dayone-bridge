import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DayOneClient {
  constructor(journalName = null) {
    this.journalName = journalName;
  }

  async createEntry(entryData) {
    const {
      text,
      date,
      latitude,
      longitude,
      tags = [],
      photos = [],
      starred = false
    } = entryData;

    const args = [];

    if (this.journalName) {
      args.push(`--journal "${this.journalName}"`);
    }

    if (date) {
      const isoDate = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
      args.push(`--isoDate="${isoDate}"`);
    }

    if (latitude && longitude) {
      args.push(`--coordinate ${latitude} ${longitude}`);
    }

    if (tags && tags.length > 0) {
      const tagArgs = tags.map(tag => tag.includes(' ') ? `"${tag}"` : tag).join(' ');
      args.push(`--tags ${tagArgs}`);
    }

    if (starred) {
      args.push('--starred');
    }

    // if (photos && photos.length > 0) {
    //   const photoArgs = photos.slice(0, 10).map(p => `"${p}"`).join(' ');
    //   args.push(`--attachments ${photoArgs}`);
    // }

    args.push('--');
    args.push('new');

    const command = `printf "%b" "${this.escapeText(text)}" | dayone ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.error('Day One CLI stderr:', stderr);

        // Check for database upgrade error
        if (stderr.includes('The model used to open the store is incompatible') ||
            stderr.includes('Day One database needs to be upgraded')) {
          throw new Error('Day One database needs to be upgraded. Please launch Day One to upgrade the database, then try again.');
        }
      }

      return { success: true, output: stdout };
    } catch (error) {
      // Check if this is a database upgrade error
      if (error.stderr && (error.stderr.includes('The model used to open the store is incompatible') ||
          error.stderr.includes('CoreData: error'))) {
        throw new Error('Day One database needs to be upgraded. Please launch Day One to upgrade the database, then try again.');
      }

      console.error('Error creating Day One entry:', error);
      throw error;
    }
  }

  escapeText(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/\n/g, '\\n');
  }

  async checkCLIAvailable() {
    try {
      await execAsync('which dayone');
      return true;
    } catch (error) {
      return false;
    }
  }
}
