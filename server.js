const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/log", (req, res) => {
  const msg = req.body?.message || "unknown";
  const time = new Date().toLocaleTimeString("id-ID", { hour12: false });
  console.log(`[${time}] ${msg}`);
  res.sendStatus(200);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
}); 
