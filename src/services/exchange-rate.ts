import { config } from "../config";
import { Errors } from "../errors";

export interface ExchangeRate {
  pair: string;
  rate: string;
  source: "horizon-orderbook" | "fallback";
  cached: boolean;
  fetchedAt: string;
}

type OrderBook = { asks?: Array<{ price: string }>; bids?: Array<{ price: string }> };
let cached: { value: ExchangeRate; expiresAt: number } | null = null;

function numeric(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Read XLM/stable order-book pricing and cache it for the configured TTL. */
export async function getExchangeRate(): Promise<ExchangeRate> {
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.value, cached: true };
  }

  const url = new URL("/order_book", config.HORIZON_URL);
  url.searchParams.set("selling_asset_type", "native");
  url.searchParams.set("buying_asset_type", "credit_alphanum4");
  url.searchParams.set("buying_asset_code", config.STABLE_ASSET_CODE);
  url.searchParams.set("buying_asset_issuer", config.STABLE_ASSET_ISSUER);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(config.HORIZON_STATUS_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Horizon returned ${response.status}`);
    const book = (await response.json()) as OrderBook;
    const ask = numeric(book.asks?.[0]?.price);
    const bid = numeric(book.bids?.[0]?.price);
    const rate = ask && bid ? (ask + bid) / 2 : ask ?? bid;
    if (rate === null) throw new Error("Horizon order book has no usable price");
    const value: ExchangeRate = {
      pair: `XLM/${config.STABLE_ASSET_CODE}`,
      rate: rate.toString(),
      source: "horizon-orderbook",
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
    cached = { value, expiresAt: Date.now() + config.EXCHANGE_RATE_CACHE_TTL * 1000 };
    return value;
  } catch (error) {
    if (cached) return { ...cached.value, cached: true };
    throw Errors.upstream(`Exchange rate unavailable: ${error instanceof Error ? error.message : "upstream failure"}`);
  }
}

export function clearExchangeRateCache(): void {
  cached = null;
}
