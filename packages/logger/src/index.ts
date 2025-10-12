import { createLogger, format, transports } from "winston";

const level = process.env.LOG_LEVEL || "info";
const isDev = process.env.NODE_ENV !== "production";

const logger = createLogger({
  level,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.printf((info: any) => {
      const { level, message, timestamp, stack, ...meta } = info;
      const base = `${timestamp} ${level.toUpperCase()} ${message}`;
      const metaKeys = Object.keys(meta || {});
      const metaPart = metaKeys.length ? ` ${JSON.stringify(meta)}` : "";
      if (stack) return `${base} ${stack}${metaPart}`;
      return base + metaPart;
    })
  ),
  defaultMeta: { service: "exe" },
  transports: [
    new transports.Console({
      stderrLevels: ["error"],
      format: isDev
        ? format.combine(
            format.colorize(),
            format.printf((info: any) => {
              const { level, message, timestamp, stack, ...meta } = info;
              const base = `${timestamp} ${level} ${message}`;
              const metaKeys = Object.keys(meta || {});
              const metaPart = metaKeys.length
                ? ` ${JSON.stringify(meta)}`
                : "";
              if (stack) return `${base} ${stack}${metaPart}`;
              return base + metaPart;
            })
          )
        : undefined,
    }),
  ],
});

// Helper wrappers
export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => logger.info(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => logger.warn(msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    logger.error(msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) =>
    logger.debug(msg, meta),
};

export default logger;
