import { AppError } from "./errors.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertAllowedCallbackUrl(
  rawUrl: string,
  allowedOrigins: readonly string[],
): URL {
  const url = new URL(rawUrl);
  const isLocalHttp =
    url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);

  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new AppError(
      400,
      "CALLBACK_URL_NOT_ALLOWED",
      "Callback URLs must use HTTPS; HTTP is permitted only for localhost",
    );
  }

  if (
    allowedOrigins.length > 0 &&
    !allowedOrigins.includes(url.origin)
  ) {
    throw new AppError(
      400,
      "CALLBACK_URL_NOT_ALLOWED",
      `Callback origin ${url.origin} is not allowed`,
    );
  }

  return url;
}
