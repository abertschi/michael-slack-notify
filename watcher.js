const Horseman = require('node-horseman');
const EventEmitter = require('events');
const debug = require('debug')('slack-notify');
const trace = require('debug')('slack-notify:debug');
const colors = require('colors');

const SETTING_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.michael-slack-nofity/';
const COOKIE_PATH = SETTING_DIR + 'cookies.txt';

class Watcher extends EventEmitter {

  constructor(options = {}) {
    super();
    if (!options.team) {
      throw new Error('Team name not set');
    } else if (!options.email) {
      throw new Error('Email not set');
    }

    this.options = options;
    this._timeout = null;
    this._watchInterval = null;
  }

  login() {
    return new Promise((resolve, reject) => {
      this.horseman = new Horseman({
        timeout: '20000',
        cookiesFile: COOKIE_PATH
      });

      this.horseman
        .userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:27.0) Gecko/20100101 Firefox/27.0")
        .viewport(1800, 900)
        .open(`https://${this.options.team}.slack.com`)
        .title()
        .then(title => {
          return new Promise((resolve, reject) => {
            if (title == 'Slack') {
              this.horseman
                .value('#email', this.options.email)
                .value('#password', this.options.password)
                .click('#signin_btn')
                .waitForNextPage()
                .title()
                .then((title) => {
                  if (title == 'Slack') {
                    reject(new Error('Username or password wrong'));
                  } else {
                    this.horseman
                      .wait(5000)
                      .then(() => resolve(this.horseman));
                  }
                })
                .catch(reject);
            } else if (title == '' || !title) {
              reject(new Error('Slack.com not found.'));
            } else {
              debug(`Using stored cookies for login`);
              this.horseman
                .wait(5000)
                .then(() => resolve(this.horseman))
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

  _getTimeoutTimer() {
    return setTimeout(() => {
      clearInterval(this._watchInterval);
      throw new Error('Horseman not responding');
    }, 1000 * 60 * 5 ); // 5 mins;
  }

  watch() {
    let done = true;
    let unreadChannels = 0;
    return new Promise((resolve, reject) => {
      this._watchInterval = setInterval(() => {
        if (done) {
          done = false;
          if (this._timeout) {
            clearTimeout(this._timeout);
          }
          this._timeout = this._getTimeoutTimer();
          trace('Fetching updates', new Date());

          this.horseman
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
                this.emit('notification', notifications);
              } else if (unreadChannels > notifications) {
                this.emit('notification_seen', notifications);
              }
              unreadChannels = notifications;
              done = true;
            }).catch(reject);
        }
      }, 1000);
    });
  }
}

exports.Watcher = Watcher;
