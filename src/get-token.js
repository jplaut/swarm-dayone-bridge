import dotenv from 'dotenv';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();

const execAsync = promisify(exec);

const CLIENT_ID = process.env.FOURSQUARE_CLIENT_ID;
const CLIENT_SECRET = process.env.FOURSQUARE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080/callback';
const PORT = 8080;

class FoursquareAuth {
  async getAccessToken() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error('❌ Missing FOURSQUARE_CLIENT_ID or FOURSQUARE_CLIENT_SECRET in .env file');
      console.log('\nTo get these credentials:');
      console.log('1. Go to https://foursquare.com/developers/apps');
      console.log('2. Create a new app or select an existing one');
      console.log('3. Copy the Client ID and Client Secret');
      console.log('4. Add them to your .env file\n');
      process.exit(1);
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        if (req.url.startsWith('/callback')) {
          const url = new URL(req.url, `http://localhost:${PORT}`);
          const code = url.searchParams.get('code');

          if (code) {
            try {
              const tokenUrl = 'https://foursquare.com/oauth2/access_token';
              const params = new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
                code: code
              });

              const response = await fetch(`${tokenUrl}?${params.toString()}`, {
                method: 'GET'
              });

              const data = await response.json();

              if (data.access_token) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                  <html>
                    <head>
                      <meta charset="UTF-8">
                      <title>Success!</title>
                    </head>
                    <body style="font-family: Arial; padding: 50px; text-align: center;">
                      <h1 style="color: green;">✅ Authorization Successful!</h1>
                      <p>Your access token has been retrieved.</p>
                      <p>You can close this window and return to your terminal.</p>
                    </body>
                  </html>
                `);

                server.close();
                resolve(data.access_token);
              } else {
                throw new Error('No access token in response');
              }
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <head><title>Error</title></head>
                  <body style="font-family: Arial; padding: 50px; text-align: center;">
                    <h1 style="color: red;">✗ Error</h1>
                    <p>${error.message}</p>
                  </body>
                </html>
              `);
              server.close();
              reject(error);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Error</title></head>
                <body style="font-family: Arial; padding: 50px; text-align: center;">
                  <h1 style="color: red;">✗ Error</h1>
                  <p>No authorization code received</p>
                </body>
              </html>
            `);
            server.close();
            reject(new Error('No authorization code'));
          }
        }
      });

      server.listen(PORT, async () => {
        const authUrl = `https://foursquare.com/oauth2/authenticate?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

        console.log('🔐 Starting Foursquare OAuth flow...\n');
        console.log('Opening browser for authorization...');
        console.log('If the browser doesn\'t open, visit this URL:\n');
        console.log(authUrl);
        console.log('\n');

        try {
          await execAsync(`open "${authUrl}"`);
        } catch (error) {
          console.log('Could not open browser automatically. Please open the URL above manually.\n');
        }
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${PORT} is already in use. Please close other applications using this port.`);
        } else {
          console.error('❌ Server error:', error.message);
        }
        reject(error);
      });
    });
  }
}

async function main() {
  try {
    const auth = new FoursquareAuth();
    const token = await auth.getAccessToken();

    console.log('\n✓ Success! Your access token is:\n');
    console.log(token);
    console.log('\n📝 Add this to your .env file:');
    console.log(`SWARM_ACCESS_TOKEN=${token}`);
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Failed to get access token:', error.message);
    process.exit(1);
  }
}

main();
