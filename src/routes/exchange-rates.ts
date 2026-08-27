import { FastifyInstance } from "fastify";
import { getExchangeRate } from "../services/exchange-rate";

export default async function exchangeRateRoutes(app: FastifyInstance) {
  app.get("/api/exchange-rates", async () => getExchangeRate());
}
