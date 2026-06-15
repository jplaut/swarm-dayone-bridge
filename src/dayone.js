import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DayOneClient {
  constructor(journalName = null) {
    this.journalName = journalName;
    this.cliReinstallAttempted = false;
  }

  async createEntry(entryData) {
    return this._createEntryWithRetry(entryData, false);
  }

  async _createEntryWithRetry(entryData, isRetry = false) {
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
        if (this._isDatabaseError(stderr)) {
          if (!isRetry && !this.cliReinstallAttempted) {
            console.log('Database error detected. Attempting to reinstall Day One CLI...');
            await this._reinstallCLI();
            console.log('CLI reinstalled. Retrying entry creation...');
            return this._createEntryWithRetry(entryData, true);
          } else {
            const errorMsg = isRetry
              ? 'Day One database error persists after CLI reinstall. Please launch Day One app to upgrade the database.'
              : 'Day One database needs to be upgraded. Please launch Day One to upgrade the database, then try again.';
            console.error(errorMsg);
            console.error('Full stderr:', stderr);
            throw new Error(errorMsg);
          }
        }
      }

      return { success: true, output: stdout };
    } catch (error) {
      // Check if this is a database upgrade error
      if (error.stderr && this._isDatabaseError(error.stderr)) {
        if (!isRetry && !this.cliReinstallAttempted) {
          console.log('Database error detected. Attempting to reinstall Day One CLI...');
          await this._reinstallCLI();
          console.log('CLI reinstalled. Retrying entry creation...');
          return this._createEntryWithRetry(entryData, true);
        } else {
          const errorMsg = isRetry
            ? 'Day One database error persists after CLI reinstall. Please launch Day One app to upgrade the database.'
            : 'Day One database needs to be upgraded. Please launch Day One to upgrade the database, then try again.';
          console.error(errorMsg);
          console.error('Full error:', error.message);
          if (error.stderr) console.error('Full stderr:', error.stderr);
          throw new Error(errorMsg);
        }
      }

      console.error('Error creating Day One entry:', error);
      throw error;
    }
  }

  _isDatabaseError(stderr) {
    return stderr.includes('The model used to open the store is incompatible') ||
           stderr.includes('Day One database needs to be upgraded') ||
           stderr.includes('CoreData: error');
  }

  async _reinstallCLI() {
    this.cliReinstallAttempted = true;
    try {
      const installCommand = 'sudo bash "/Applications/Day One.app/Contents/Resources/install_cli.sh"';
      console.log('Running:', installCommand);
      const { stdout, stderr } = await execAsync(installCommand);
      if (stdout) console.log('Install stdout:', stdout);
      if (stderr) console.log('Install stderr:', stderr);
    } catch (error) {
      console.error('Failed to reinstall Day One CLI:', error.message);
      throw new Error('Failed to reinstall Day One CLI. Please run manually: sudo bash "/Applications/Day One.app/Contents/Resources/install_cli.sh"');
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
