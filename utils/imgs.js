// Assuming you've set up Google Cloud Storage and the generateUploadSignedUrl function
const { Storage } = require("@google-cloud/storage");
const ImageForRemoval = require("../models/ImageForRemoval");
const File = require("../models/File");
const storage = new Storage({
  keyFilename: "./myplaces-408714-6cb8be1652b7.json",
});
const bucketName = process.env.GCS_BUCKET_NAME;
async function moveImageToPermanentStorage(tempUrl) {
  // Extract the path from the URL
  const tempImagePath = new URL(tempUrl).pathname.replace(
    `/${bucketName}/`,
    ""
  );
  const permanentImagePath = tempImagePath.replace("temporary/", "permanent/");
  const bucket = storage.bucket(bucketName);

  // Create a reference to the permanent file
  const permanentFile = bucket.file(permanentImagePath);

  try {
    // Check if the permanent file already exists
    const [exists] = await permanentFile.exists();

    if (exists) {
      console.log("File already exists in permanent storage.");
      return `https://storage.googleapis.com/${bucketName}/${permanentImagePath}`;
    } else {
      // Move the file within the bucket if it does not exist
      await bucket.file(tempImagePath).move(permanentImagePath);
      console.log("File moved to permanent storage.");

      // Generate the public URL
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${permanentImagePath}`;
      await indexFileInDatabase({
        name: permanentImagePath,
        publicUrl,
        timeCreated: new Date(), // You might want to adjust this based on actual file creation time if available
      });
      return publicUrl;
    }
  } catch (error) {
    console.error("Failed to move image:", error);
    throw error;
  }
}
async function markImageForRemoval(imageUrl, referenceId) {
  // Check if the image is already marked for removal to avoid duplicates
  const existingRecord = await ImageForRemoval.findOne({
    imageUrl,
    referenceId,
  });
  if (!existingRecord) {
    const imageForRemoval = new ImageForRemoval({ imageUrl, referenceId });
    await imageForRemoval.save();
  }
}
async function generateUploadSignedUrl(filename) {
  // Define the action as "write" and set the content type to "application/octet-stream" for binary data.
  const options = {
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000, // Set expiration time to 15 minutes.
    contentType: "application/octet-stream",
  };
  console.log(bucketName);
  // Get the signed URL.
  const [url] = await storage
    .bucket(bucketName)
    .file(filename)
    .getSignedUrl(options);

  // Return the signed URL.
  return url;
}

async function deleteImages(imagesPaths) {
  try {
    const deletionPromises = imagesPaths.map((imagePath) => {
      return bucket
        .file(imagePath)
        .delete()
        .then(() => console.log(`Deleted image ${imagePath}`))
        .catch((err) =>
          console.error(`Failed to delete image ${imagePath}:`, err)
        );
    });

    await Promise.all(deletionPromises);
  } catch (error) {
    console.error("Error deleting images:", error);
    throw error; // Optionally rethrow to handle the error in the calling context
  }
}
async function deleteImageFromCloudStorage(imageUrl) {
  try {
    const imagePath = new URL(imageUrl).pathname.replace(`/${bucketName}/`, "");
    await storage.bucket(bucketName).file(imagePath).delete();
    console.log(`Successfully deleted ${imageUrl}`);
  } catch (error) {
    console.error(`Failed to delete image ${imageUrl}:`, error);
    throw error;
  }
}
async function deleteTemporaryDirectoryImages() {
  try {
    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix: "temporary/" });

    // Get the current time
    const now = new Date();

    const deletionPromises = files.map(async (file) => {
      const fileMetadata = await file.getMetadata();
      const fileCreationTime = new Date(fileMetadata[0].timeCreated);

      // Calculate the difference in hours
      const diffHours = Math.abs(now - fileCreationTime) / 36e5; // 36e5 is the number of milliseconds in one hour

      // Check if the file is older than 24 hours
      if (diffHours > 24) {
        // Delete the file if it is older than 24 hours
        await file.delete();
        console.log(`Deleted old temporary image: ${file.name}`);
      }
    });

    await Promise.all(deletionPromises);
    console.log(`Completed cleanup of temporary directory.`);
  } catch (error) {
    console.error("Failed to delete images in temporary directory:", error);
    throw error;
  }
}

async function cleanupOrphanedImages() {
  const imagesForRemoval = await ImageForRemoval.find({});

  const deletionPromises = imagesForRemoval.map(async (imageRecord) => {
    await deleteImageFromCloudStorage(imageRecord.imageUrl);
    await ImageForRemoval.findByIdAndDelete(imageRecord._id);
  });

  try {
    await Promise.all(deletionPromises);
    console.log("Cleanup of orphaned images completed successfully.");
  } catch (error) {
    console.error(
      "An error occurred during the cleanup of orphaned images:",
      error
    );
  }
}
const listImages = async (pageSize = 10, pageToken = null) => {
  const options = {
    maxResults: pageSize,
  };

  if (pageToken) {
    options.pageToken = pageToken;
  }

  const [files, , meta] = await storage.bucket(bucketName).getFiles(options);

  const images = files
    .map((file) => ({
      name: file.name,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${file.name}`,
      timeCreated: new Date(file.metadata.timeCreated),
    }))
    .sort((a, b) => b.timeCreated - a.timeCreated); // Sort by most recent first

  return {
    images: images.map(({ name, publicUrl }) => ({ name, publicUrl })), // Omit 'timeCreated' from final response if not needed
    nextPageToken: meta.nextPageToken,
  };
};
async function indexPermanentImagesInDatabase() {
  const bucket = storage.bucket(bucketName);
  const prefix = "permanent/"; // Adjust based on your actual folder structure

  // Get all files under the "permanent" directory
  const [files] = await bucket.getFiles({ prefix });

  for (const file of files) {
    const { name, metadata } = file;
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${name}`;
    const timeCreated = new Date(metadata.timeCreated);

    // Check if this file already exists in the database
    const exists = await File.findOne({ name });

    if (!exists) {
      // File does not exist in the database, so add it
      const newFile = new File({
        name,
        publicUrl,
        timeCreated,
      });

      await newFile.save();
      console.log(`Indexed ${name} in database.`);
    } else {
      console.log(`${name} already exists in database.`);
    }
  }
}
// Function to delete an image from a bucket
const deleteImage = async (imageName) => {
  await storage.bucket(bucketName).file(imageName).delete();
  await removeFileFromDatabase(imageName);
};
/**
 * Indexes a file in the database.
 *
 * @param {Object} fileData Object containing file metadata
 * @param {string} fileData.name Name of the file
 * @param {string} fileData.publicUrl Public URL of the file
 * @param {Date} fileData.timeCreated The creation date of the file
 * @returns {Promise<Object>} The saved file document
 */
const indexFileInDatabase = async ({ name, publicUrl, timeCreated }) => {
  try {
    // Create a new document instance using the File model
    const file = new File({
      name,
      publicUrl,
      timeCreated,
    });

    // Save the document to the database
    const savedFile = await file.save();

    console.log("File indexed in database successfully:", savedFile);
    return savedFile;
  } catch (error) {
    console.error("Error indexing file in database:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
};
async function removeFileFromDatabase(imageName) {
  try {
    // Assuming `name` is a unique identifier for your files in the database
    const result = await File.deleteOne({ name: imageName });
    console.log(`File ${imageName} removed from database:`, result);
  } catch (error) {
    console.error(`Error removing file ${imageName} from database:`, error);
    throw error;
  }
}

module.exports = {
  generateUploadSignedUrl,
  deleteImages,
  moveImageToPermanentStorage,
  markImageForRemoval,
  cleanupOrphanedImages,
  deleteTemporaryDirectoryImages,
  listImages,
  indexPermanentImagesInDatabase,
  deleteImage,
  indexFileInDatabase,
};
