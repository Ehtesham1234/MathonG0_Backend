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
  // Check if title or customProperties are empty
  if (
    !title ||
    !customProperties ||
    title.trim() === "" ||
    customProperties.length === 0
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // Check if any customProperty has empty title or fallbackValue
  for (let prop of customProperties) {
    if (
      !prop.title ||
      !prop.fallbackValue ||
      prop.title.trim() === "" ||
      prop.fallbackValue.trim() === ""
    ) {
      throw new ApiError(400, "All fields in customProperties are required");
    }
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

  // Fetch the list to get the custom properties and their fallback values
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
      // At this point, 'results' should be an array of user objects from your CSV file.
      // You can now loop through it and add each user to your database.

      for (let user of results) {
        // Create a new object for the properties
        const properties = { ...fallbackValues };

        // Overwrite the fallback values with the values from the CSV file, if they exist and are not empty
        for (let prop in user) {
          if (user[prop]) {
            properties[prop] = user[prop];
          }
        }

        // Create a new user with the data from the CSV file and the listId from the route parameter
        const newUser = new User({
          name: user.name,
          email: user.email,
          properties, // Use the new properties object
          list: listId,
        });

        // Save the new user to the database
        try {
          await newUser.save();
          successfulCount++;
        } catch (err) {
          errorCount++;
          errors.push({ email: user.email, error: err.message });
          failedRecords.push({ ...user, error: err.message }); // Add the failed record to the array
          continue; // Continue with the next user
        }
      }

      // Delete the file from the file system
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error("Error deleting file:", err);
        }
      });

      // Send a response when done
      if (errorCount > 0) {
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(failedRecords); // Convert the failed records to CSV
        fs.writeFileSync("failed_records.csv", csv); // Write the CSV data to a file

        return next(
          new ApiError(
            400,
            {
              successfulCount,
              errorCount,
              total: successfulCount + errorCount,
              errors,
              failedRecordsFile: "failed_records.csv", // Include the path to the CSV file in the response
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
  // Check if userId is empty
  if (!listId || listId.trim() === "") {
    return next(new ApiError(400, "list ID is required."));
  }
  const list = await List.findById(listId);
  if (!list) {
    return next(new ApiError(400, "No list available ."));
  }

  const users = await User.find({ list: listId, subscribe: true });

  let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: "edd.jakubowski60@ethereal.email",
      pass: "Ned7T19GNgQdeDUM7H",
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
  // Check if userId is empty
  if (!userId || userId.trim() === "") {
    return next(new ApiError(400, "User ID is required."));
  }
  // Fetch the user from the database
  const user = await User.findById(userId);

  if (!user) {
    return next(new ApiError(404, "User not found."));
  }

  // Update the user's record to indicate that they have unsubscribed
  user.subscribe = false;
  await user.save();

  res.send(
    new ApiResponse(200, null, "You have been unsubscribed successfully.")
  );
});

export { list, users, sendEmails, unSubscribe };
