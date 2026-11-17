import { join } from "node:path";
import { hostname } from "node:os";
import { createServer } from "node:http";
import express from "express";
import wisp from "wisp-server-node";

import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const app = express();

// Parse JSON bodies (supports images & files up to 20MB for MEGO ELROSY AI)
app.use(express.json({ limit: "20mb" }));

// Load our publicPath first and prioritize it over UV.
app.use(express.static("./public"));
// Load vendor files last.
app.use("/uv/", express.static(uvPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

// MEGO ELROSY AI Endpoint
app.post("/api/ai", async (req, res) => {
	try {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			return res.status(500).json({ error: "مفتاح GEMINI_API_KEY غير مضاف في إعدادات Render" });
		}

		const { prompt, file } = req.body || {};
		const parts = [{ text: prompt || "اشرح هذا الملف أو الصورة بالتفصيل." }];
		if (file && file.data) {
			parts.push({
				inlineData: {
					mimeType: file.mimeType || "application/octet-stream",
					data: file.data,
				},
			});
		}

		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ contents: [{ parts }] }),
			}
		);

		const data = await response.json();
		if (!response.ok) {
			return res.status(500).json({ error: data.error?.message || "خطأ من خادم الذكاء الاصطناعي" });
		}

		const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "لم يتم استلام رد.";
		return res.json({ reply });
	} catch (err) {
		return res.status(500).json({ error: err.message || "خطأ داخلي في السيرفر" });
	}
});

// Error for everything else
app.use((req, res) => {
	res.status(404);
	res.sendFile("./public/404.html", { root: "." });
});

const server = createServer();

server.on("request", (req, res) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
	app(req, res);
});

server.on("upgrade", (req, socket, head) => {
	if (req.url.endsWith("/wisp/")) {
		wisp.routeRequest(req, socket, head);
		return;
	}
	socket.end();
});

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

server.on("listening", () => {
	const address = server.address();
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	server.close();
	process.exit(0);
}

server.listen({
	port,
});
