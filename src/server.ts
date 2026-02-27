import { createApp } from "./app";
import { logger } from "./utils/logger";

const app = createApp();
const port = Number(process.env.PORT ?? "3000");

app.listen(port, () => {
  logger.info({ port }, "server listening");
});
