require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// routes
app.use("/api/generate", require("./routes/generate"));
app.use("/api/payment", require("./routes/payment"));
app.use("/api/verify", require("./routes/verify"));

mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB connected");
  app.listen(5000, () => console.log("Server running on 5000"));
})
.catch(err => console.error(err));