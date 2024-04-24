const User = require("../models/User");
const { generateUploadSignedUrl, deleteImage } = require("../utils/imgs");
// Controller method for updating profile picture
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const generateSignedUrl = async (req, res, next) => {
  const type = req.query.type; // 'profile' or 'post'
  const orgnialName = req.query.fileName;
  const isTemporary = req.query.isTemporary === "true"; // Check if 'isTemporary' query parameter is true
  const validTypes = ["profile", "post", "chat", "file"];

  if (!validTypes.includes(type)) {
    return res.status(400).json({ message: "Invalid type parameter" });
  }

  // Determine the prefix based on 'type' and 'isTemporary'
  let prefix =
    type === "profile"
      ? "profile-pictures"
      : type === "post"
      ? "post-images"
      : type === "file"
      ? "files"
      : "chat-images";
  if (isTemporary) {
    prefix = `temporary/${prefix}`; // Prepend 'temporary/' if 'isTemporary' is true
  }

  const filename =
    type === "file"
      ? `${prefix}/${orgnialName}`
      : `${prefix}/${req.user.id}-${Date.now()}`;

  try {
    // await sleep(20000); // Wait for 20 seconds
    // Generate the signed URL for uploading.
    const signedUrl = await generateUploadSignedUrl(filename);
    const bucketName = process.env.GCS_BUCKET_NAME;
    // Send the signed URL back to the client.
    res.json({
      message: "Signed URL generated successfully.",
      signedUrl: signedUrl,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${filename}`, // This URL is where the image will be accessible after upload
    });
  } catch (error) {
    next(error);
  }
};

// Controller to list all images in the bucket
// const listImagesController = async (req, res, next) => {
//   const { pageSize, pageToken } = req.query;

//   try {
//     const result = await listImages(parseInt(pageSize, 10), pageToken);
//     res.json(result);
//   } catch (error) {
//     console.error("Failed to list images:", error);
//     next(error);
//   }
// };
const File = require("../models/File"); // Assuming you have a File model

// Adjusted listImages function to fetch from MongoDB using page numbers
async function listImages(pageSize = 10, pageNumber = 1) {
  // Calculate skip value based on pageNumber and pageSize
  const skip = (pageNumber - 1) * pageSize;

  // Fetch sorted and paginated results from the database
  const files = await File.find({})
    .sort({ timeCreated: -1 }) // Sort by most recent first
    .skip(skip)
    .limit(pageSize)
    .lean(); // Use .lean() for performance if you don't need a Mongoose document

  // Calculate total number of pages
  const totalFiles = await File.countDocuments({});
  const totalPages = Math.ceil(totalFiles / pageSize);

  return {
    images: files.map((file) => ({
      name: file.name,
      publicUrl: file.publicUrl,
      timeCreated: file.timeCreated,
    })),
    totalPages,
    currentPage: pageNumber,
  };
}

const listImagesController = async (req, res, next) => {
  const { pageSize = 10, page = 1 } = req.query; // Use 'page' query parameter for page number

  try {
    const result = await listImages(parseInt(pageSize, 10), parseInt(page, 10));
    res.json(result);
  } catch (error) {
    console.error("Failed to list images:", error);
    next(error);
  }
};
const indexFiles = async (req, res) => {
  const { name, publicUrl, timeCreated } = req.body;
  console.log(req.body);
  try {
    let file = await File.findOne({ name });

    if (!file) {
      // File does not exist, add it to the database
      file = new File({
        name,
        publicUrl,
        timeCreated: new Date(timeCreated),
      });
      await file.save();
      console.log(`Indexed ${name} in database.`);
    } else {
      // If the file already exists, optionally update it or leave as is
      // For example, you might want to update the publicUrl or timeCreated
      console.log(`${name} already exists in database.`);
      // Update logic here if needed
    }

    // Respond with the file information (consider what you really need to send back)
    res.status(201).json({
      message: "File processed successfully",
      data: {
        name: file.name,
        publicUrl: file.publicUrl,
        timeCreated: file.timeCreated,
      },
    });
  } catch (error) {
    console.error("Failed to index the file:", error);
    res.status(500).json({ message: "Failed to index the file", error });
  }
};
// Controller to delete an image from the bucket
const deleteImagesController = async (req, res, next) => {
  const { imageNames } = req.body; // Expecting an array of image names

  if (!Array.isArray(imageNames) || imageNames.length === 0) {
    return res.status(400).json({
      message: "Invalid request. Please provide an array of image names.",
    });
  }

  try {
    // Delete images from cloud storage
    await Promise.all(imageNames.map((imageName) => deleteImage(imageName)));

    // Delete image records from MongoDB
    await File.deleteMany({ name: { $in: imageNames } });

    res.json({ message: "Images deleted successfully." });
  } catch (error) {
    console.error("Failed to delete images:", error);
    next(error);
  }
};

module.exports = {
  generateSignedUrl,
  deleteImagesController,
  listImagesController,
  indexFiles,
};
