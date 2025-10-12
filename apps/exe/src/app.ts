import express from "express";
import executeRoute from "./routes/execute";
import { prewarmAllVenvs } from "./services/docker";
import { log } from "@ottrpad/logger";

const app: express.Express = express();
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_, res) => res.json({ status: "ok", service: "exe" }));
app.use("/execute", executeRoute);

// Basic error handler fallback
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    log.error("Unhandled error", { error: err });
    res.status(500).json({ error: "Internal Server Error" });
  }
);

// Prefer a service-specific port env var to avoid collisions with a shared PORT in the monorepo
const port = process.env.EXE_PORT || process.env.PORT || 4004;
if (require.main === module) {
  app.listen(port, () => {
    log.info(`exe service listening on :${port}`);
    // Optionally prewarm venvs to reduce first-run latency
    if (/^(1|true)$/i.test(process.env.EXE_PREWARM || "0")) {
      prewarmAllVenvs(2).catch(() => {});
    }
    // Optional prewarm controlled by env
    const doPrewarm = /^(1|true|all)$/i.test(
      process.env.EXE_VENV_PREWARM || ""
    );
    const concurrency =
      Number(process.env.EXE_VENV_BUILDER_CONCURRENCY || 2) || 2;
    if (doPrewarm) {
      setTimeout(() => {
        prewarmAllVenvs(concurrency).catch((e: any) =>
          log.warn("prewarm.error", { error: e?.message || e })
        );
      }, 1000).unref();
    }
  });
}

export default app;
