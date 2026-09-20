import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "node:path";

// Shared by main.ts and the e2e tests, so tests run the app exactly as deployed.
// The app must be created with `{ rawBody: true }` (WhatsApp signature checks).
export function configureApp(app: NestExpressApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useStaticAssets(join(__dirname, "..", "public"));
  app.enableShutdownHooks();
  return app;
}
