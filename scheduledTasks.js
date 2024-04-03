const cron = require("node-cron");
const {
  cleanupOrphanedImages,
  deleteTemporaryDirectoryImages,
} = require("./utils/imgs");

// Schedule the cleanup of temporary images to run at the start of every hour
cron.schedule("0 * * * *", async () => {
  console.log("Starting cleanup of temporary images...");
  await deleteTemporaryDirectoryImages();
  console.log("Temporary images cleanup completed.");
});

// You might want to run different tasks at different times, but if you also
// want the cleanup of orphaned images to run every hour, you can use the same schedule:
cron.schedule("0 * * * *", async () => {
  console.log("Starting cleanup of orphaned images...");
  await cleanupOrphanedImages();
  console.log("Orphaned images cleanup completed.");
});
