const path = require("path");
const express = require("express");

const app = express();
const port = Number(process.env.PORT || 8080);

// Serve the built React application
app.use("/", express.static(path.join(__dirname, "diagram-compiler/dist")));

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] http://localhost:${port}/ (diagram-compiler/dist)`);
});