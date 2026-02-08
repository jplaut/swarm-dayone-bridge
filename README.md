# Swarm to Day One Bridge

**Automatically sync your Swarm/Foursquare checkins to your Day One journal.**

## Why This Exists

Day One doesn't natively support Swarm integration, and the only official existing solution (IFTTT) doesn't preserve photos or coordinates. This bridge fills that gap, giving you a complete archive of your location history in Day One with all the rich data Swarm captures.

## ✨ Features

- **📍 Precise Coordinates** - Preserves exact GPS location data for map view in Day One
- **🏷️ Smart Tagging** - Auto-tags entries with venue categories
- **👥 Social Context** - Includes friends tagged in checkins
- **🔄 Intelligent Sync** - Tracks last synced checkin to avoid duplicates, resumes on interruption
- **⚡ Automatic Execution** - Runs in the background on your Mac so you never have to worry about syncing manually
- **🔁 Retry Failed Syncs** - Tracks and retries failed checkins automatically
- **📝 Complete History** - One-time full sync of your entire Swarm history
- **🎯 No Data Loss** - Preserves shouts, timestamps, addresses, and venue links
- **📸 Photo Support** (disabled by default due to Day One CLI bug) - Automatically downloads and attaches photos from your checkins (up to 10 per entry)

## Prerequisites

- macOS
- [Day One](https://dayoneapp.com/) app with [CLI](https://dayoneapp.com/guides/day-one-for-mac/command-line-interface-cli/) installed
- [Node.js](https://nodejs.org/) (v18 or higher)
- Swarm/Foursquare account

## Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Day One CLI**

   The Day One CLI is included with the Day One app. Install Day One from the Mac App Store, then enable the CLI:

   - Open Day One
   - Go to Day One → Settings → General
   - Enable "Command Line Tools"

   Verify installation:
   ```bash
   which dayone
   ```

4. **Environment Variables**

   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

5. **Get your Swarm access token**

   You need a Foursquare/Swarm OAuth access token to fetch your checkins.

   1. Go to https://foursquare.com/developers/apps
   2. Create a new app (or use an existing one)
   3. Set the **Redirect URI** to: `http://localhost:8080/callback`
   4. Copy your **Client ID** and **Client Secret**
   5. Add them to your `.env` file:
      ```
      FOURSQUARE_CLIENT_ID=your_client_id_here
      FOURSQUARE_CLIENT_SECRET=your_client_secret_here
      ```
   6. Run the token generator:
      ```bash
      npm run get-token
      ```
   7. Your browser will open automatically - authorize the app
   8. The access token will be displayed in your terminal
   9. Copy it to your `.env` file:
      ```
      SWARM_ACCESS_TOKEN=your_token_here
      ```

## Usage

### Initial Full Sync

**First time setup:** Sync ALL your historical Swarm checkins:
```bash
npm run sync-all
```

This will:
- Fetch your entire Swarm checkin history
- Create Day One entries for all checkins (oldest to newest)
- Track progress and can resume if interrupted
- Take a while depending on how many checkins you have

**Note:** This only needs to be run once. After the initial sync, use the regular sync command.

### Manual Sync

Sync recent checkins (incremental):
```bash
npm run sync
```

This fetches the last 250 checkins and only creates entries for new ones.

### Retry Failed Checkins

If some checkins failed to sync (due to network issues, API errors, etc.), retry them:
```bash
npm run retry-failed
```

Failed checkins are automatically tracked in `.sync-state.json`. This command will:
- Fetch fresh data for each failed checkin
- Attempt to create Day One entries
- Remove successfully synced checkins from the failed list
- Keep failed ones for future retry attempts

### Test Fetch

Fetch and create a Day One entry for your most recent checkin:
```bash
npm run test-fetch
```

## Automatic Syncing

### Option 1: Hammerspoon Spoon (Recommended)

The easiest way to set up automatic syncing using a Hammerspoon Spoon:

1. **Install Hammerspoon**
   ```bash
   brew install --cask hammerspoon
   ```

2. **Create logs directory**
   ```bash
   mkdir -p logs
   ```

3. **Install the SwarmSync Spoon**

   Open the `SwarmSync.spoon` file to install it.

4. **Configure Hammerspoon**

   Add this to your `~/.hammerspoon/init.lua`:
   ```lua
   -- Load SwarmSync Spoon
   hs.loadSpoon("SwarmSync")
   
   -- Configure paths
   spoon.SwarmSync.projectPath = "/Users/YOUR_USERNAME/dayone-swarm-bridge"
   spoon.SwarmSync.nodePath = "/usr/local/bin/node"  -- or /opt/homebrew/bin/node
   
   -- Optional: Bind a hotkey for manual sync (Cmd+Shift+S)
   spoon.SwarmSync:bindHotkeys({
     sync = {{"cmd", "shift"}, "S"}
   })
   
   -- Start automatic syncing
   spoon.SwarmSync:start()
   ```

5. **Update the paths**
   - Replace `YOUR_USERNAME` with your actual username
   - Update `nodePath` with your Node.js path (run `which node` to find it)

6. **Reload Hammerspoon**
   - Open Hammerspoon
   - Click the Hammerspoon menu icon → Reload Config

Your checkins will now sync automatically!

**Triggers:**
- 🌐 Connecting to any WiFi/Ethernet network
- 💤 Waking from sleep
- ⌨️ Manual sync hotkey (if configured)

**Smart Features:**
- 5-minute cooldown prevents duplicate syncs
- Waits for network to stabilize before syncing
- Desktop notifications for sync status

**View logs:**
```bash
tail -f logs/sync.log
```

**Check Hammerspoon console:**
- Click Hammerspoon menu icon → Console

### Option 2: Scheduled Intervals with Cron

Set up a cron job to run the sync script at regular intervals while your Mac is awake:

1. **Create logs directory**
   ```bash
   mkdir -p logs
   ```

2. **Find your Node.js path**
   ```bash
   which node
   ```

3. **Edit your crontab**
   ```bash
   crontab -e
   ```

4. **Add a sync schedule**

   Run every hour:
   ```
   0 * * * * cd /Users/jon/dev/dayone-swarm-bridge && /usr/local/bin/node src/sync.js >> logs/sync.log 2>&1
   ```

   **Important:** Replace `/usr/local/bin/node` with your Node.js path from step 2.

**Note:** Cron jobs only run while your Mac is awake. Missed schedules during sleep won't be executed.

## How It Works

1. **Fetches** recent checkins from the Swarm API
2. **Filters** out checkins that have already been synced (tracked in `.sync-state.json`)
3. **Creates** Day One entries with:
   - Venue name as title
   - Your shout/comment
   - Location details and coordinates
   - Venue category
   - Friends tagged
   - Links to Swarm checkin and venue
   - Appropriate tags
   - Original checkin timestamp

## Troubleshooting

### Day One CLI not found
```bash
which dayone
```
If this returns nothing, reinstall Day One and enable CLI in settings.

### Invalid ISO date format
Make sure you're using the latest version of the code. The Day One CLI requires dates in `yyyy-mm-ddThh:mm:ssZ` format (without milliseconds).

### Swarm API errors
- Check that your `SWARM_ACCESS_TOKEN` is correct in `.env`
- Tokens don't expire, but can be revoked in your Foursquare account settings
- Run `npm run get-token` to get a new token if needed

### Hammerspoon not triggering
Check the Hammerspoon console for errors:
- Click Hammerspoon menu icon → Console
- Look for error messages or sync logs

Verify the config is loaded:
```bash
cat ~/.hammerspoon/init.lua | grep "Swarm to Day One"
```

Check sync logs:
```bash
tail -f logs/sync.log
```

### Photos not attaching
Due to a current bug with the DayOne CLI, photos are currently disabled by default. To enable photo syncing, uncomment the photo attachment code in `src/dayone.js` (lines 46-49).

## Files

- `src/sync.js` - Incremental sync script
- `src/sync-all.js` - Full history sync script
- `src/retry-failed.js` - Retry failed checkins
- `src/test-fetch.js` - Test script for single checkin
- `src/test-photo.js` - Test script for photo attachment
- `src/dayone.js` - Day One CLI wrapper
- `src/get-token.js` - OAuth token retrieval
- `hammerspoon-config.lua` - Hammerspoon automation config
- `.sync-state.json` - Tracks sync state and failed checkins (auto-generated)
- `temp-photos/` - Downloaded photos cache (auto-generated)
- `logs/` - Log files (auto-generated)

## License

MIT
