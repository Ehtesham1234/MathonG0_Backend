import { Router } from "express";
import {
  list,
  users,
  sendEmails,
  unSubscribe,
  getLists,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route("/lists").post(list);
router.route("/lists").get(getLists);
router.route("/lists/users/:listId").post(upload.single("file"), users);
router.get("/download/:filename", function (req, res) {
  const filename = req.params.filename;
  const file = `./${filename}`; // If the file is in the outermost directory
  res.download(file);
});
router.post("/send/email/toall/:id", sendEmails);
router.get("/unsubscribe/:id", unSubscribe);

export default router;
