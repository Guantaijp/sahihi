import { Logger } from "@nestjs/common";

// Imported first by every spec: keeps tests away from the local .env
// (see AppModule), from writing sessions to disk, and quiet.
process.env.NODE_ENV = "test";
process.env.SESSION_STORE_PATH = "";
Logger.overrideLogger(false);
