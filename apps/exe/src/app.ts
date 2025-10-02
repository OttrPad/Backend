import express from "express";
import executeRoute from "./routes/execute";

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
    console.error("[exe] Unhandled error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
);

const port = process.env.PORT || 4004;
if (require.main === module) {
  app.listen(port, () => console.log(`exe service listening on :${port}`));
}

export default app;
