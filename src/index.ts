import app from "./app.ts";

const port = parseInt(process.env["PORT"] ?? "3000", 10);

console.log(`PipeForge AI Pipeline Builder API`);
console.log(`Starting server on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};
