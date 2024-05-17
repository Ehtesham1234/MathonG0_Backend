import mongoose, { Schema } from "mongoose";

const listSchema = new mongoose.Schema({
  title: String,
  customProperties: [
    {
      title: { type: String, lowercase: true, required: true },
      fallbackValue: { type: String, lowercase: true, required: true },
    },
  ],
});

export const List = mongoose.model("List", listSchema);
