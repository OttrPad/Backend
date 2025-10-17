import express from "express";
import executeRoute from "./routes/execute";
import { prewarmAllVenvs, initializeDocker, isDockerReady } from "./services/docker";
import { log } from "@ottrpad/logger";

const app: express.Express = express();
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_, res) => {
  const dockerReady = isDockerReady();
  return res.json({ 
    status: dockerReady ? "ok" : "initializing", 
    service: "exe",
    docker: dockerReady ? "ready" : "not ready"
  });
});
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
  app.listen(port, async () => {
    log.info(`exe service listening on :${port}`);
    
    // Initialize Docker connection with retry logic
    try {
      log.info("docker.init.start", { message: "Initializing Docker connection..." });
      await initializeDocker();
      log.info("docker.init.success", { message: "Docker is ready for execution requests" });
    } catch (error: any) {
      log.error("docker.init.error", { 
        error: error.message || String(error),
        message: "Service will continue but execution requests will fail until Docker is available"
      });
      // Continue running - Docker might become available later
      // We'll retry on each execution request
    }
    
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
