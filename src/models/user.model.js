import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    properties: {
      type: Schema.Types.Mixed, // Can hold any structure
      default: {},
    },
    subscribe: { type: Boolean, default: true },
    list: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "List",
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model("User", userSchema);
