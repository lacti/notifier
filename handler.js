'use strict';

const awsServerlessExpress = require('aws-serverless-express');
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();
const bodyParser = require('body-parser');
const server = awsServerlessExpress.createServer(app);

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

const mysql = require('mysql');
const dbConfig = {
  host: process.env.DB_HOST,
  user: 'notifier',
  password: process.env.DB_PASSWORD,
  database: 'notifier',
};

const query = (sql) => new Promise((resolve, reject) => {
  let db = mysql.createConnection(dbConfig);
  db.connect();
  db.query(sql, (err, result, fields) => {
    db.end();
    if (err) {
      console.log('error occurred in database query');
      console.log(err);
      reject(err);
    } else {
      resolve(result);
    }
  });
});

app.use(line.middleware(config));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.post('/webhook', (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(error => res.json(error));
});

app.post('/noti/:key', (req, res) => {
  const key = req.params.key;
  const message = {
    type: 'text',
    text: `(${key}) ${req.body.text}`
  };
  query(`SELECT id FROM subs WHERE \`key\`="${key}"`).then(result => {
    let userIds = result.filter(e => e.id.startsWith('U')).map(e => e.id);
    let groupIds = result.filter(e => e.id.startsWith('C')).map(e => e.id);
    Promise.all(
        groupIds.map(id => client.pushMessage(id, message))
          .concat(userIds.length > 0 ? client.multicast(userIds, message) : Promise.resolve(null))
        )
      .then(result => res.json(result))
      .catch(error => res.json(error));
  });
});

const help = `안녕하세요!
@[on/off] [key]로 알람을 조정하고 @status로 상태를 확인할 수 있습니다.
예) @on ktx`;
const onoff = /@(on|off)\s+(.+)$/;

function handleEvent(event) {
  console.log(event);
  if (
    event.replyToken === '00000000000000000000000000000000' ||
    event.replyToken === 'ffffffffffffffffffffffffffffffff'
  ) {
    return Promise.resolve(null);
  }

  const id = event.source.groupId || event.source.userId;
  if (event.type === 'follow' || event.type == 'join') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: help
    });
  } else if (event.type === 'unfollow' || event.type == 'leave') {
    const id = event.source.groupId || event.source.userId;
    return query(`DELETE FROM subs WHERE id="${id}"`);
  }

  // ignore other events except text
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const text = (event.message.text || '').toLowerCase();
  if (onoff.test(text)) {
    let cmd = text.match(onoff);
    let op = cmd[1];
    let selectedKey = cmd[2];
    if (op === 'on') {
      return query(`REPLACE INTO subs (id, \`key\`) VALUES ("${id}", "${selectedKey}")`);
    } else /* off */ {
      return query(`DELETE FROM subs WHERE id="${id}" AND \`key\`="${selectedKey}"`);
    }
  }
  else if ('@status' === text) {
    return query(`SELECT GROUP_CONCAT(\`key\` SEPARATOR '\n') AS status FROM subs WHERE id='${id}' GROUP BY id`)
      .then(res => {
        const subs = res[0];
        const status = subs && subs.status ? subs.status : 'empty';
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: status
        });
      });
  }
  else if ('@help' === text) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: help
    });
  }
  return Promise.resolve(null);
}

module.exports.express = (event, context) =>
  awsServerlessExpress.proxy(server, event, context);
