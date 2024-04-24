// groupEvents.js

const {
  createGroup,
  editGroup,
  handleExitGroup,
  HandleUpdateGroupImg,
} = require("../../controllers/groupController");
const createContext = require("./createContext");
const { asyncErrorHandler } = require("./socketErrorHandlers");
const createGroupAsync = asyncErrorHandler(createGroup);
const editGroupAsync = asyncErrorHandler(editGroup);

const handleExitGroupAsync = asyncErrorHandler(handleExitGroup);
const HandleUpdateGroupImgAsync = asyncErrorHandler(HandleUpdateGroupImg);

module.exports = (io, socket, onlineUsers) => {
  // Registering group-related event listeners
  const context = createContext(io, socket, onlineUsers);

  socket.on("create group", (data) => createGroupAsync(context, data));
  socket.on("edit group", (data) => editGroupAsync(context, data));
  socket.on("update group img", (data) =>
    HandleUpdateGroupImgAsync(context, data)
  );

  socket.on("exit group", (data) => handleExitGroupAsync(context, data));
};
