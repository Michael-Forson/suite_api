import { createApp } from "./createApp.js";

const PORT = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
