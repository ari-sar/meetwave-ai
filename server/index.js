require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());

// Razorpay webhook MUST be mounted with raw body BEFORE express.json() so signature verification works.
const paymentRouter = require("./routes/payment");
app.post("/api/payment/webhook", express.raw({ type: "application/json" }), paymentRouter.webhookHandler);

app.use(express.json());

const generatedDir = path.join(__dirname, "..", "uploads", "generated");
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true });
}

app.use("/generated", express.static(path.join(__dirname, "..", "uploads", "generated")));

app.use("/api/generate", require("./routes/generate"));
app.use("/api/payment", paymentRouter);
app.use("/api/verify", require("./routes/verify"));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(5000, () => console.log("Server running on 5000"));
  })
  .catch(err => console.error(err));
