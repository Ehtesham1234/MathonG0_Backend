import mongoose from "mongoose";
import csvParser from "csv-parser";
import { Parser } from "json2csv";
import fs from "fs";
import nodemailer from "nodemailer";
import hbs from "nodemailer-express-handlebars";
import { List } from "../models/list.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const list = asyncHandler(async (req, res, next) => {
  const { title, customProperties } = req.body;
  if (
    !title ||
    !customProperties ||
    title.trim() === "" ||
    customProperties.length === 0
  ) {
    throw new ApiError(400, "All fields are required");
  }

  for (let prop of customProperties) {
    if (!prop.title || prop.title.trim() === "") {
      throw new ApiError(400, "All fields in customProperties are required");
    }
  }
  const existingList = await List.findOne({ title: title.toLowerCase() });
  if (existingList) {
    throw new ApiError(400, "A list with this title already exists");
  }

  try {
    const newList = new List({
      title,
      customProperties,
    });

    await newList.save();

    res.status(201).json(new ApiResponse(201, newList));
  } catch (error) {
    next(
      new ApiError(500, "An error occurred while saving the list", [
        error.message,
      ])
    );
  }
});

const users = asyncHandler(async (req, res, next) => {
  const listId = req.params.listId;
  const file = req.file;

  if (!file) {
    return next(new ApiError(400, "No file uploaded."));
  }

  const list = await List.findById(listId);
  const fallbackValues = {};
  for (let prop of list.customProperties) {
    fallbackValues[prop.title] = prop.fallbackValue;
  }

  const results = [];
  let successfulCount = 0;
  let errorCount = 0;
  const errors = [];
  const failedRecords = [];

  fs.createReadStream(file.path)
    .pipe(csvParser())
    .on("data", (data) => results.push(data))
    .on("end", async () => {
      const emailPattern = /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/;

      for (let user of results) {
        const properties = { ...fallbackValues };

        for (let prop in user) {
          if (user[prop]) {
            properties[prop] = user[prop];
          }
        }

        if (!emailPattern.test(user.email)) {
          errorCount++;
          errors.push({ email: user.email, error: "Invalid email format." });
          failedRecords.push({ ...user, error: "Invalid email format." });
          continue;
        }

        const newUser = new User({
          name: user.name,
          email: user.email,
          properties,
          list: listId,
        });

        try {
          await newUser.save();
          successfulCount++;
        } catch (err) {
          errorCount++;
          errors.push({ email: user.email, error: err.message });
          failedRecords.push({ ...user, error: err.message });
          continue;
        }
      }

      fs.unlink(file.path, (err) => {
        if (err) {
          console.error("Error deleting file:", err);
        }
      });

      if (errorCount > 0) {
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(failedRecords);

        // Create a unique name for the file using a timestamp
        const timestamp = Date.now();
        const fileName = `failed_records_${timestamp}.csv`;

        fs.writeFileSync(fileName, csv);
        return next(
          new ApiError(
            400,
            {
              successfulCount,
              errorCount,
              total: successfulCount + errorCount,
              errors,
              failedRecordsFile: fileName,
            },
            "Some users were not added due to errors."
          )
        );
      } else {
        res.send(
          new ApiResponse(
            200,
            {
              successfulCount,
              errorCount,
              total: successfulCount + errorCount,
            },
            "Users have been added successfully."
          )
        );
      }
    });
});

const sendEmails = asyncHandler(async (req, res, next) => {
  const listId = req.params.id;
  if (!listId || listId.trim() === "") {
    return next(new ApiError(400, "list ID is required."));
  }
  const list = await List.findById(listId);
  if (!list) {
    return next(new ApiError(400, "No list available ."));
  }

  const users = await User.find({ list: listId, subscribe: true });

  let transporter = nodemailer.createTransport({
    service: "gmail",
    // host: "smtp.ethereal.email",
    port: 465,
    secure: false,
    auth: {
      // user: "edd.jakubowski60@ethereal.email",
      // pass: "Ned7T19GNgQdeDUM7H",
      user: "tiadsforme@gmail.com",
      pass: "jkhgvpxcarwuianv",
    },
  });

  transporter.use(
    "compile",
    hbs({
      viewEngine: {
        extName: ".handlebars",
        partialsDir: "views",
        layoutsDir: "views",
        defaultLayout: "email",
      },
      viewPath: "views",
      extName: ".handlebars",
    })
  );

  let successfulCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let user of users) {
    function generatePropertiesString(user) {
      let propertiesString = "";
      for (let key in user.properties) {
        if (key !== "email" && key !== "name") {
          propertiesString += `We have received your ${key} as ${user.properties[key]}. `;
        }
      }
      return propertiesString;
    }

    try {
      let propertiesString = generatePropertiesString(user);
      await transporter.sendMail({
        from: '"MathonGo" <ehteshamusman@gmail.com>',
        to: user.email,
        subject: "Welcome to MathonGo",
        template: "email",
        context: {
          ...user.properties,
          _id: user._id,
          propertiesString: propertiesString,
        },
      });
      successfulCount++;
    } catch (error) {
      errorCount++;
      errors.push({ email: user.email, error: error.message });
    }
  }

  if (errorCount > 0) {
    return next(
      new ApiError(
        400,
        {
          successfulCount,
          errorCount,
          total: successfulCount + errorCount,
          errors,
        },
        "Some emails were not sent due to errors."
      )
    );
  } else {
    res.send(
      new ApiResponse(
        200,
        {
          successfulCount,
          errorCount,
          total: successfulCount + errorCount,
        },
        "Emails have been sent successfully."
      )
    );
  }
});

const unSubscribe = asyncHandler(async (req, res, next) => {
  const userId = req.params.id;
  if (!userId || userId.trim() === "") {
    return next(new ApiError(400, "User ID is required."));
  }
  const user = await User.findById(userId);

  if (!user) {
    return next(new ApiError(404, "User not found."));
  }
  user.subscribe = false;
  await user.save();

  res.send(
    new ApiResponse(200, null, "You have been unsubscribed successfully.")
  );
});

export { list, users, sendEmails, unSubscribe };
