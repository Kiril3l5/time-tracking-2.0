/**
 * Mobile Test Environment Setup
 * 
 * This script sets up a browser-sync server to help with mobile device testing.
 * It provides:
 * 1. External URL for accessing the dev server from mobile devices
 * 2. Synchronized testing across devices
 * 3. UI for controlling the test environment
 */

/*eslint-disable no-undef, no-console*/

import browserSync from 'browser-sync';
import ip from 'ip';

// Create a new browser-sync instance
const bs = browserSync.create('Time Tracking Mobile Test');

// Get local IP address to share with mobile devices
const localIP = ip.address();

// Start the browser-sync server
bs.init({
  proxy: {
    target: 'http://localhost:5173', // Default Vite dev server address
    ws: true, // Proxy websockets for HMR
  },
  open: false, // Don't open browser automatically
  notify: true, // Show notifications in the browser
  ui: {
    port: 3001, // Port for the browser-sync UI
  },
  ghostMode: {
    // Sync actions between browsers
    clicks: true,
    forms: true,
    scroll: true,
  },
  logLevel: 'info',
  logPrefix: 'Mobile Test',
  logConnections: true,
  middleware: [
    // Add mobile device detection middleware
    function(req, res, next) {
      const ua = req.headers['user-agent'];
      if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
        console.log('Mobile device connected:', ua);
      }
      next();
    }
  ],
  snippetOptions: {
    // Inject browser-sync client script
    rule: {
      match: /<\/body>/i,
      fn: function (snippet, match) {
        return snippet + match;
      }
    }
  },
  rewriteRules: [
    {
      match: /<head>/i,
      fn: function(match) {
        // Add viewport meta tag for mobile testing if not present
        return match + '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">';
      }
    }
  ],
  plugins: [],
  files: [
    // Watch for file changes in these directories
    'packages/*/src/**/*.{js,jsx,ts,tsx,css}',
    'packages/*/public/**/*.{html,css,js}',
  ],
});

// Display information about how to connect
console.log('\n========================================');
console.log('🔥 Mobile Testing Environment Ready 🔥');
console.log('========================================');
console.log(`Local URL: http://localhost:${bs.getOption('port')}`);
console.log(`External URL for mobile devices: http://${localIP}:${bs.getOption('port')}`);
console.log(`BrowserSync UI: http://localhost:${bs.options.get('ui').get('port')}`);
console.log('----------------------------------------');
console.log('👉 Point your mobile device to the External URL');
console.log('👉 Make sure your mobile device is on the same WiFi network');
console.log('========================================\n'); 