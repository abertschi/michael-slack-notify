'use strict';

const notifier = require('node-notifier');
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const Horseman = require('node-horseman');
const EventEmitter = require('events');
const debug = require('debug')('slack-notify');
const trace = require('debug')('slack-notify:debug');
const colors = require('colors');
const prompt = require('prompt');
const fs = require('fs');
const mkdirp = require('mkdirp');

const SETTING_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.michael-slack-nofity/';
const SETTING_PATH = SETTING_DIR + 'michael-slack-notify.json';
const COOKIE_PATH = SETTING_DIR + 'cookies.txt';

let events = new EventEmitter();

function login(options) {
  return new Promise((resolve, reject) => {
    let horseman = new Horseman({
      timeout: '20000',
      cookiesFile: COOKIE_PATH
    });

    horseman
      .userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0")
      .viewport(1800, 900)
      .open(`https://${options.team}.slack.com`)
      .screenshot('test.png')
      .title()
      .then(title => {
        return new Promise(function(resolve, reject) {
          if (title == 'Slack') {
            horseman
              .value('#email', options.email)
              .value('#password', options.password)
              .click('#signin_btn')
              .waitForNextPage()
              .title()
              .then((title) => {
                if (title == 'Slack') {
                  reject(new Error('Username or password wrong'));
                } else {
                  horseman
                    .wait(5000)
                    .then(() => resolve(horseman));
                }
              })
              .catch(reject);
          } else if (title == '' || !title) {
            reject(new Error('Slack.com not found.'));
          } else {
            debug(`Using stored cookies for login`);
            horseman
              .wait(5000)
              .then(() => resolve(horseman))
              .catch(reject);
          }
        });
      })
      .then(login => {
        resolve(login);
      })
      .catch(reject);
  });
}

function watch(horseman) {
  let done = true;
  let unreadChannels = 0;

  return new Promise((resolve, reject) => {
    setInterval(() => {
      if (done) {
        trace('new iteration', new Date());
        done = false;
        horseman
          .html('#im-list')
          .then(html => {
            if (!html) {
              throw new Error('Slack.com not reachable');
            }
            let notifications = 0;
            let result = html.match(/".*?"/g);

            if (result) {
              result.forEach(r => {
                if (r.indexOf('unread_highlight') > -1 && r.indexOf('hidden') == -1) {
                  notifications++;
                }
              });
            }
            return notifications;
          })
          .then(notifications => {
            if (unreadChannels < notifications) {
              events.emit('notification', notifications);
            } else if (unreadChannels > notifications) {
              events.emit('notification_seen', notifications);
            }
            unreadChannels = notifications;
            done = true;
          }).catch(reject);
      }
    }, 1000);
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

function run(options) {
  debug(`Login to ${colors.green(options.team)} as ${colors.green(options.email)}`);
  login(options)
    .then(horseman => {
      debug('Login successful!'.green);
      browser = horseman;

      watch(browser).catch(errorHandling);

      events.on('notification', (channels) => {
        debug('New notification received!');
        debug(windowIsHidden);
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
      events.on('notification_seen', (channels) => {
        debug('Notifications read!');
        if (!windowIsHidden) {
          windowIsHidden = true;
          mainWindow.close();
        }
      });
    })
    .catch(errorHandling);
}

function errorHandling(err) {
  debug('%s, %s'.red, err, err.stack);
  setTimeout(() => {
    debug('Restarting michael-slack-nofity');
    let options = JSON.parse(fs.readFileSync(SETTING_PATH));
    run(options);
  }, 10000);
}

async function promptCredentials() {
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


let browser;
let unreadChannels = 0;
let windowIsHidden = true;
let mainWindow;

app.on('window-all-closed', function() {
  windowIsHidden = true;
});

process.on('uncaughtException', (err) => {
  errorHandling(err);
});


debug('michael-slack-notify');

try {
  let options = JSON.parse(fs.readFileSync(SETTING_PATH));
  run(options);
} catch (err) {
  debug('%s not found', SETTING_PATH);
  mkdirp(SETTING_DIR, (err) => {
    if (err) {
      throw err;
    }

    promptCredentials()
      .then(options => {
        fs.writeFile(SETTING_PATH, JSON.stringify(options), function(err) {
          if (err) {
            debug(err);
          }
        });
        run(options);
      }).catch(e => debug(e));
  });
}
