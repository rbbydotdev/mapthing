import index from "./index.html";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY || "YOUR_API_KEY";

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/api/config": {
      GET: () => {
        return Response.json({ apiKey: API_KEY });
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Server running at http://localhost:3000");
