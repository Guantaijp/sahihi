import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap() {
  const app = configureApp(await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true }));

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`Sahihi running on http://localhost:${port}`);
  logger.log(`Test web-chat UI: http://localhost:${port}/index.html`);
}

bootstrap();
