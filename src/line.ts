import * as line from '@line/bot-sdk';
import * as awsTypes from 'aws-lambda';

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.CHANNEL_SECRET!,
};

type TextReplier = (response: string) => Promise<boolean>;

interface IEventHandler {
  is: (event: line.WebhookEvent) => boolean;
  do: (
    args: {
      reply: TextReplier;
      event: line.WebhookEvent;
      client: line.Client;
    },
  ) => Promise<boolean>;
}

interface ITextHandler {
  is: (text: string) => boolean;
  do: (
    args: {
      text: string;
      reply: TextReplier;
      event: line.MessageEvent;
      client: line.Client;
    },
  ) => Promise<boolean>;
}

interface IWebhookHandler {
  eventHandlers: IEventHandler[];
  textHandlers: ITextHandler[];
  verbose?: {
    request?: boolean;
    error?: boolean;
  };
}

export const groupOrUserId = (event: line.WebhookEvent) =>
  event.source.type === 'group'
    ? event.source.groupId || event.source.userId!
    : event.source.userId!;

const processEvent = async (
  hook: IWebhookHandler,
  event: line.WebhookEvent,
  client: line.Client,
) => {
  const reply = async (response: string) => {
    if (event.type !== 'unfollow' && event.type !== 'leave') {
      client.replyMessage(event.replyToken, {
        type: 'text',
        text: response,
      });
      return true;
    }
    console.log(`Reply is not supported: ${event.type}`);
    return false;
  };

  try {
    for (const handler of hook.eventHandlers) {
      if (handler.is(event)) {
        if (await handler.do({ reply, event, client })) {
          return;
        }
      }
    }
    switch (event.type) {
      case 'message':
        switch (event.message.type) {
          case 'text':
            {
              const text = event.message.text || '';
              for (const handler of hook.textHandlers) {
                if (handler.is(text)) {
                  if (await handler.do({ text, reply, event, client })) {
                    return;
                  }
                }
              }
            }
            break;
        }
    }
  } catch (error) {
    console.error(error);
    if (hook.verbose && hook.verbose.request) {
      reply(`에러가 발생했어요: (${typeof error}) ${error.message || 'Error'}`);
    }
  }
};

export const webhook = (hook: IWebhookHandler) => async (
  gatewayEvent: awsTypes.APIGatewayEvent,
  context: awsTypes.Context,
  callback: awsTypes.Callback,
) => {
  if (hook.verbose && hook.verbose.request) {
    console.log(gatewayEvent);
  }

  const signature = gatewayEvent.headers['X-Line-Signature'] as string;
  if (!signature) {
    return callback(new line.SignatureValidationFailed('no signature'));
  }

  const body = gatewayEvent.body!;
  if (!line.validateSignature(body, config.channelSecret, signature)) {
    return callback(
      new line.SignatureValidationFailed(
        'signature validation failed',
        signature,
      ),
    );
  }

  try {
    const events: { events: line.WebhookEvent[] } = JSON.parse(body);
    console.log(JSON.stringify(events, null, 2));

    const client = new line.Client(config);
    for (const event of events.events) {
      await processEvent(hook, event, client);
    }
  } catch (err) {
    return callback(new line.JSONParseError(err.message, body));
  }
  return callback(null, {
    statusCode: 200,
    body: 'OK',
  });
};

export const broadcastText = (ids: string[], text: string) => {
  const client = new line.Client(config);
  const userIds = ids.filter(e => e.startsWith('U'));
  const groupIds = ids.filter(e => e.startsWith('C'));
  const message: line.TextMessage = {
    type: 'text',
    text,
  };
  return Promise.all(
    groupIds
      .map(id => client.pushMessage(id, message))
      .concat(
        userIds.length > 0
          ? client.multicast(userIds, message)
          : Promise.resolve(null),
      ),
  );
};
