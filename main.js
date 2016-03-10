'use strict';

const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const debug = require('debug')('slack-notify');
const colors = require('colors');
const prompt = require('prompt');
const fs = require('fs');
const mkdirp = require('mkdirp');
const Watcher = require('./watcher.js').Watcher;

const SETTING_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.michael-slack-nofity/';
const SETTING_PATH = SETTING_DIR + 'michael-slack-notify.json';

let watcher;
let windowIsHidden = true;
let mainWindow;

process.on('uncaughtException', errorHandling);
app.on('window-all-closed',() => windowIsHidden = true);

debug('michael-slack-notify');
loadCredentials().then(credentials => run(credentials)).catch(errorHandling);

function run(credentials) {
  debug(`Login to ${colors.green(credentials.team)} as ${colors.green(credentials.email)}`);

  watcher = new Watcher(credentials);
  watcher.login()
    .then(() => {
      debug('Login successful!'.green);

      watcher.watch().catch(errorHandling);
      watcher.on('notification', (channels) => {
        debug('New notification received!');

        if (windowIsHidden) {
          windowIsHidden = false;

          mainWindow = createWindow();
          mainWindow.on('closed', () => {
            windowIsHidden = true;
          });
          mainWindow.on('blur', () => {
            windowIsHidden = true;
          });
          mainWindow.on('minimize', () => {
            windowIsHidden = true;
          });
        }
      });

      watcher.on('notification_seen', (channels) => {
        debug('Notifications read!');
        if (!windowIsHidden) {
          windowIsHidden = true;
          mainWindow.close();
        }
      });

    }).catch(errorHandling);
}

function loadCredentials() {
  return new Promise((resolve, reject) => {
    try {
      resolve(JSON.parse(fs.readFileSync(SETTING_PATH)));
    } catch (err) {
      debug('%s not found', SETTING_PATH);
      mkdirp(SETTING_DIR, (err) => {
        if (err) {
          reject(err);
        }
        promptCredentials()
          .then(options => {
            fs.writeFile(SETTING_PATH, JSON.stringify(options), function(err) {
              if (err) {
                reject(err);
              }
            });
            resolve(options);
          })
          .catch(reject);
      });
    }
  });
}

function promptCredentials() {
  return new Promise((resolve, reject) => {
    var schema = {
      properties: {
        team: {
          message: 'Your slack team',
          required: true
        },
        email: {
          required: true
        },
        password: {
          hidden: true
        }
      }
    };
    prompt.start();
    prompt.get(schema, function(err, result) {
      if (!err) {
        resolve({
          team: result.team,
          email: result.email,
          password: result.password
        });
      } else {
        reject(err);
      }
    });
  });
}

function createWindow() {
  let mainWindow = new BrowserWindow({
    width: 400,
    height: 250,
    center: true
  });

  mainWindow.loadURL('file://' + __dirname + '/index.html');
  return mainWindow;
}

function errorHandling(err) {
  debug('%s, %s'.red, err, err.stack);
  watcher = null;
  setTimeout(() => {
    debug('Restarting michael-slack-nofity');
    let creds = loadCredentials();
    creds.then(credentials => run(credentials)).catch(errorHandling);
  }, 10000);
}
