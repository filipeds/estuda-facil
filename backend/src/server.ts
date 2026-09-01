import Fastify from "fastify";
import cors from "@fastify/cors";
import { PORT } from "./config.js";
import subjectsRoutes from "./routes/subjects.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });
await fastify.register(subjectsRoutes);

fastify.get("/api/health", async () => ({ ok: true }));

try {
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
