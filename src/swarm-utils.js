import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const STATE_FILE = '.sync-state.json';
export const TEMP_PHOTOS_DIR = join(__dirname, '..', 'temp-photos');

export async function downloadPhoto(url, filepath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download photo: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(filepath));
}

export async function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = await readFile(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading state:', error.message);
  }
  return { lastCheckinId: null, lastSyncTimestamp: null, failedCheckins: [] };
}

export async function saveState(state) {
  try {
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving state:', error.message);
  }
}

export async function formatCheckinForDayOne(checkin) {
  const venue = checkin.venue;
  const createdAt = new Date(checkin.createdAt * 1000);

  let text = `# ${venue.name}\n\n`;

  if (checkin.shout) {
    text += `${checkin.shout}\n\n`;
  }

  text += `📍 `;
  if (venue.location.address) {
    text += `${venue.location.address}`;
  }
  if (venue.location.city) {
    text += `${venue.location.address ? ', ' : ''}${venue.location.city}`;
  }
  if (venue.location.state) {
    text += `, ${venue.location.state}`;
  }
  if (venue.location.country) {
    text += `, ${venue.location.country}`;
  }
  text += '\n\n';

  if (venue.categories && venue.categories.length > 0) {
    const category = venue.categories[0];
    text += `🏷️ ${category.name}\n\n`;
  }

  if (checkin.with && checkin.with.length > 0) {
    const friends = checkin.with.map(friend => 
      `${friend.firstName}${friend.lastName ? ' ' + friend.lastName : ''}`
    ).join(', ');
    text += `👥 With: ${friends}\n\n`;
  }

  // Download photos if present
  const photoFiles = [];
  if (checkin.photos && checkin.photos.count > 0) {
    if (!existsSync(TEMP_PHOTOS_DIR)) {
      await mkdir(TEMP_PHOTOS_DIR, { recursive: true });
    }

    const photos = checkin.photos.items;
    for (let i = 0; i < Math.min(photos.length, 10); i++) {
      const photo = photos[i];
      const photoUrl = `${photo.prefix}original${photo.suffix}`;
      const filename = join(TEMP_PHOTOS_DIR, `${checkin.id}-photo-${i + 1}.jpg`);

      try {
        await downloadPhoto(photoUrl, filename);
        photoFiles.push(filename);
      } catch (error) {
        console.error(`  Failed to download photo ${i + 1}: ${error.message}`);
      }
    }

    if (photoFiles.length > 0) {
      text += `📸 ${photoFiles.length} photo${photoFiles.length > 1 ? 's' : ''} from Swarm\n\n`;
      for (let i = 0; i < photoFiles.length; i++) {
        text += `[{attachment}]\n`;
      }
      text += '\n';
    }
  }

  text += `🕐 ${createdAt.toLocaleString()}\n\n`;
  text += `🔗 **Checkin:** https://www.swarmapp.com/c/${checkin.id}\n`;
  text += `📍 **Place:** https://foursquare.com/v/${venue.id}\n`;

  const tags = ['Check-in'];
  if (venue.categories && venue.categories.length > 0) {
    tags.push(venue.categories[0].name);
  }

  return {
    text,
    date: createdAt,
    latitude: venue.location.lat,
    longitude: venue.location.lng,
    photos: photoFiles,
    tags
  };
}
