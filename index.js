const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const app = express();

app.use(cors());

app.get("/", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("Missing ?url=");
  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    const body = await response.text();
    res.set("Access-Control-Allow-Origin", "*");
    res.send(body);
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on ${PORT}`));
