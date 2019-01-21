import { api, ApiError } from 'api-gateway-rest-handler';
import * as db from './db';
import * as line from './line';

const help = `안녕하세요!
@[on/off] [key]로 알람을 조정하고 @status로 상태를 확인할 수 있습니다.
예) @on ktx`;

export const webhook = line.webhook({
  eventHandlers: [
    {
      is: event => event.type === 'follow' || event.type === 'join',
      do: ({ reply }) => reply(help),
    },
    {
      is: event => event.type === 'unfollow' || event.type === 'leave',
      do: async ({ event }) => {
        await db.leaveSubscription(line.groupOrUserId(event));
        return true;
      },
    },
  ],
  textHandlers: [
    {
      is: text => text.toLowerCase().startsWith('@on '),
      do: async ({ text, reply, event }) => {
        const token = text.split(/\s+/)[1];
        if (token) {
          await db.subscribe(line.groupOrUserId(event), token);
          return reply(`(${token}) 구독 완료!`);
        } else {
          return reply(`token이 올바르지 않습니다.`);
        }
      },
    },
    {
      is: text => text.toLowerCase().startsWith('@off '),
      do: async ({ text, reply, event }) => {
        const token = text.split(/\s+/)[1];
        if (token) {
          await db.unsubscribe(line.groupOrUserId(event), token);
          return reply(`(${token}) 구독 해제!`);
        } else {
          return reply(`token이 올바르지 않습니다.`);
        }
      },
    },
    {
      is: text => text.toLowerCase().startsWith('@status'),
      do: async ({ reply, event }) => {
        const { status = '' } = await db.fetchSubscriptionStatus(
          line.groupOrUserId(event),
        );
        return reply(status || '등록된 내역이 없습니다.');
      },
    },
    {
      is: text => text.toLowerCase().startsWith('@help'),
      do: async ({ reply }) => reply(help),
    },
    {
      is: text => text.startsWith('@'),
      do: async ({ reply }) => reply(`등록되지 않은 명령어입니다.`),
    },
  ],
  verbose: {
    error: true,
  },
});

export const noti = api<{ text: string }>(async req => {
  const { token } = req.pathParameters;
  if (!token) {
    throw new ApiError('No token');
  }
  const ids = (await db.fetchSubscribedChannels(token)).map(e => e.id);
  console.log(`Token:`, token, `Id:`, ids);

  const sent = await line.broadcastText(ids, `(${token}) ${req.body.text}`);
  console.log(`Sent:`, sent);
  return true;
});
