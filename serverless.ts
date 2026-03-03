const config = {
  service: "notifier",
  frameworkVersion: "4",
  provider: {
    name: "aws",
    runtime: "nodejs22.x",
    stage: "production",
    region: "ap-northeast-2",
    memorySize: 128,
    timeout: 5,
    environment: {
      CHANNEL_SECRET: "${env:CHANNEL_SECRET}",
      CHANNEL_ACCESS_TOKEN: "${env:CHANNEL_ACCESS_TOKEN}",
      DB_HOST: "${env:DB_HOST}",
      DB_PASSWORD: "${env:DB_PASSWORD}",
    },
  },
  functions: {
    webhook: {
      handler: "src/handler.webhook",
      events: [{ httpApi: { method: "POST", path: "/webhook" } }],
    },
    noti: {
      handler: "src/handler.noti",
      events: [{ httpApi: { method: "POST", path: "/noti/{token}" } }],
    },
  },
} as const;

export default config;
