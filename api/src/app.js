// const {join} = require('path');

const {WebServer} = require('./web-server.js');
// const {FireContext, mainCredName} = require('./firebase.js');
// const {DefaultSite} = require('./default-site.js');
// const {DoorwaySite} = require('./doorway-site.js');
const {ExportSite} = require('./export-site.js');
const {SessionMgmt} = require('./session-mgmt.js');

const admin = require("firebase-admin");
const serviceAccount = require(process.env.FIREBASE_ADMINSDK_KEY || "firebase-adminsdk-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://stardust-skychat.firebaseio.com",
});

const Firestore = require('./firestore-lib.js');

class UserSession {
  constructor(sessId, userId, authority) {
    this.sessId = sessId;
    this.userId = userId;
    this.authority = authority;

    const userRef = admin.firestore()
      .collection('users').doc(userId);

    this.env = new Environment;
    this.env.bind('/mnt/config/panel/prefs', new Firestore.DocMapping(userRef
      .collection('config')
      .doc('panel')
    , {
      '/userstyle.css': {Type: 'Blob', Mime:'text/css'},
    }));
    this.env.bind('/mnt/config/irc/prefs', new Firestore.DocMapping(userRef
      .collection('config')
      .doc('irc')
    , {
      '/userstyle.css': {Type: 'Blob', Mime:'text/css'},
      '/layout': String,
      '/disable-nicklist': Boolean,
      '/enable-notifs': Boolean,
    }));

    this.env.bind('/mnt/config/irc/networks', new Firestore.CollMapping(userRef
      .collection('config')
      .doc('irc')
      .collection('networks')
    , {
      '/auto-connect': Boolean,
      '/channels': [String],
      '/full-name': String,
      '/hostname': String,
      '/ident': String,
      '/nickname': String,
      '/nickserv-pass': String,
      '/port': Number,
      '/use-tls': Boolean,
      '/username': String,
    }));
    this.env.bind('/mnt/persist/irc/networks', new Firestore.CollMapping(userRef
      .collection('irc networks')
    , {
      '/avail-chan-modes': String,
      '/avail-user-modes': String,
      '/current-nick': String,
      '/latest-seen': String,
      '/paramed-chan-modes': String,
      '/server-hostname': String,
      '/server-software': String,
      '/umodes': String,
      '/wire-checkpoint': Number,
      '/wire-uri': String,

      '/channels': docRef => new Firestore.CollMapping(docRef
        .collection('channels')
      , {
        '/is-joined': Boolean,
        '/latest-activity': String,
        '/latest-mention': String,
        '/latest-seen': String,

        // '/log': TODO,
        // '/membership': TODO,
        // '/modes': TODO,
        // '/topic': TODO,
      }),

      // '/mention-log': TODO,
      // '/queries': TODO,
      // '/server-log': TODO,
      // '/supported': TODO, // string->string map
    }));
  }
}

(async () => {

  // set up state
  const sessionMgmt = new SessionMgmt(admin
    .firestore().collection('sessions'), snapshot => {
      // TODO: check expiresAt
      return new UserSession(snapshot.id, snapshot.get('uid'), snapshot.get('authority'));
    });

  // set up the skylink API
  const publicEnv = new Environment;
  publicEnv.bind('/sessions', sessionMgmt);
  publicEnv.mount('/idtoken-launch', 'function', {
    async invoke(input) {
      const {idToken, appId} = input;
      const token = await admin.auth().verifyIdToken(idToken);
      const sessionId = await sessionMgmt.createSession(token.uid, {
        application: appId,
        authority: 'IdToken',
      });
      return { Type: 'String', StringValue: sessionId };
    }});

  // serve skylink protocol
  const web = new WebServer();
  web.mountApp('/~~export', new ExportSite(publicEnv));

  console.log('App listening on', await web.listen(9231, '0.0.0.0'));

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Daemon crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
