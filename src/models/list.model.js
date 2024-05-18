import mongoose, { Schema } from "mongoose";

const listSchema = new mongoose.Schema({
  title: { type: String, lowercase: true, required: true, unique: true },
  customProperties: [
    {
      title: { type: String, lowercase: true, required: true },
      fallbackValue: {
        type: String,
        lowercase: true,
        required: true,
        default: "Unknown",
      },
    },
  ],
});

export const List = mongoose.model("List", listSchema);
