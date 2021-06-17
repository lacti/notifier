import * as line from "@line/bot-sdk";

import { APIGatewayProxyHandlerV2 } from "aws-lambda";

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.CHANNEL_SECRET!,
};

type TextReplier = (response: string) => Promise<boolean>;

interface EventHandler {
  is: (event: line.WebhookEvent) => boolean;
  do: (args: {
    reply: TextReplier;
    event: line.WebhookEvent;
    client: line.Client;
  }) => Promise<boolean>;
}

interface TextHandler {
  is: (text: string) => boolean;
  do: (args: {
    text: string;
    reply: TextReplier;
    event: line.MessageEvent;
    client: line.Client;
  }) => Promise<boolean>;
}

interface WebhookHandler {
  eventHandlers: EventHandler[];
  textHandlers: TextHandler[];
  verbose?: {
    request?: boolean;
    error?: boolean;
  };
}

export function groupOrUserId(event: line.WebhookEvent): string {
  return event.source.type === "group"
    ? event.source.groupId || event.source.userId!
    : event.source.userId!;
}

function replier(client: line.Client, event: line.WebhookEvent): TextReplier {
  return async function (response: string): Promise<boolean> {
    console.debug({ response, event }, "Respond message");
    if ("replyToken" in event) {
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: response,
      });
      return true;
    }
    console.log(`Reply is not supported: ${event.type}`);
    return false;
  };
}

async function processEvent(
  hook: WebhookHandler,
  client: line.Client,
  event: line.WebhookEvent
) {
  const reply = replier(client, event);
  try {
    for (const handler of hook.eventHandlers) {
      if (handler.is(event)) {
        if (await handler.do({ reply, event, client })) {
          return;
        }
      }
    }
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text || "";
      for (const handler of hook.textHandlers) {
        if (handler.is(text)) {
          if (await handler.do({ text, reply, event, client })) {
            return;
          }
        }
      }
    }
  } catch (error) {
    console.error({ error }, "Error occurred in processEvent");
    if (hook.verbose && hook.verbose.request) {
      reply(`에러가 발생했어요: (${typeof error}) ${error.message || "Error"}`);
    }
  }
}

export function webhook(hook: WebhookHandler): APIGatewayProxyHandlerV2 {
  return async (gatewayEvent) => {
    if (hook.verbose && hook.verbose.request) {
      console.debug({ gatewayEvent }, "Gateway event is received");
    }

    const signature = gatewayEvent.headers["x-line-signature"] as string;
    if (!signature) {
      throw new line.SignatureValidationFailed("no signature");
    }

    const body = gatewayEvent.body!;
    if (!line.validateSignature(body, config.channelSecret, signature)) {
      throw new line.SignatureValidationFailed(
        "signature validation failed",
        signature
      );
    }

    try {
      const events: { events: line.WebhookEvent[] } = JSON.parse(body);
      if (hook.verbose) {
        console.debug({ events }, "Line events are received");
      }

      const client = new line.Client(config);
      for (const event of events.events) {
        await processEvent(hook, client, event);
      }
    } catch (error) {
      throw new line.JSONParseError(error.message, body);
    }
    return {
      statusCode: 200,
      body: "OK",
    };
  };
}

export async function broadcastText(
  ids: string[],
  text: string
): Promise<line.MessageAPIResponseBase[]> {
  const client = new line.Client(config);
  return Promise.all(
    ids.map((id) =>
      client.pushMessage(id, {
        type: "text",
        text,
      })
    )
  );
}
