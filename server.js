// require("dotenv").config();
const PORT = process.env.PORT || 8080;

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors()); // all cors request enabled

app.get("/", (req, resp) => {
  resp.send("server: test success");
});

const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// access private property by closure
const map = (function () {
  let socketMap; // private
  let inverseSocketMap; // private
  let busyMap; // private
  const reset = () => {
    socketMap = new Map();
    inverseSocketMap = new Map();
    busyMap = new Set();
  };
  const set = (key, socketId) => {
    socketMap.set(key, socketId);
    inverseSocketMap.set(socketId, key);
  };
  const getSocket = (key) => socketMap.get(key);
  const deleteKey = (key) => {
    inverseSocketMap.delete(socketMap.get(key));
    socketMap.delete(key);
  };
  const deleteSocket = (socketId) => {
    socketMap.delete(inverseSocketMap.get(socketId));
    inverseSocketMap.delete(socketId);
  };
  const getKeys = () => [...socketMap.keys()];
  const checkBusy = (key) => busyMap.has(key);
  const markBusy = (key, isBusy) => {
    if (isBusy) busyMap.add(key);
    else busyMap.delete(key);
  };
  return {
    reset,
    set,
    getSocket,
    deleteKey,
    deleteSocket,
    getKeys,
    checkBusy,
    markBusy,
  };
})();
map.reset();

io.on("connection", (socket) => {
  // socket.emit -> sender
  // socket.broadcast.emit -> everyone except sender
  // io.emit -> all
  // io.to(socketId).emit -> to a particular id

  socket.on("disconnect", () => {
    console.log("User disconnected.");
    map.deleteSocket(socket.id);

    socket.broadcast.emit("server-message", {
      from: "server",
      to: "ALL",
      type: "user-update",
      message: map.getKeys(),
    });
  });

  let clientList = []; // temporary list
  let partnerKey = null,
    description = null,
    icecandidates = null; // temporary switch variable
  socket.on("client-message", (data) => {
    switch (data.type) {
      case "register":
        console.log("User connected.");
        map.set(data.from, socket.id);

        io.emit("server-message", {
          from: "server",
          to: "ALL",
          type: "user-update",
          message: map.getKeys(),
        });
        break;

      case "ping":
        socket.emit("server-message", {
          from: "server",
          to: data.from,
          type: "ping-ack",
          message: data.message,
        });
        break;

      case "user-update-request":
        clientList = map.getKeys();
        clientList.splice(clientList.indexOf(data.from), 1);
        socket.emit("server-message", {
          from: "server",
          to: data.from,
          type: "user-update",
          message: clientList,
        });
        break;

      case "connect":
        ({ partnerKey, description, icecandidates } = JSON.parse(data.message));
        if (map.checkBusy(partnerKey))
          socket.emit("server-message", {
            from: "server",
            to: data.from,
            type: "line-busy",
            message: null,
          });
        else {
          map.markBusy(data.from, true);
          map.markBusy(partnerKey, true);
          io.to(map.getSocket(partnerKey)).emit("server-message", {
            from: "server",
            to: partnerKey,
            type: "connect-request",
            message: JSON.stringify({
              partnerKey: data.from,
              description: description,
              icecandidates: icecandidates,
            }),
          });
        }
        break;

      case "connect-request-confirmed":
        ({ partnerKey, description, icecandidates } = JSON.parse(data.message));
        io.to(map.getSocket(partnerKey)).emit("server-message", {
          from: "server",
          to: partnerKey,
          type: "confirm-request",
          message: JSON.stringify({
            partnerKey: data.from,
            description: description,
            icecandidates: icecandidates,
          }),
        });
        break;

      case "connect-request-declined":
        map.markBusy(data.from, false);
        map.markBusy(data.message, false);
        io.to(map.getSocket(data.message)).emit("server-message", {
          from: "server",
          to: data.message,
          type: "connect-failure",
          message: null,
        });
        break;

      case "confirmed":
        io.to(map.getSocket(data.message)).emit("server-message", {
          from: "server",
          to: data.message,
          type: "connect-success",
          message: null,
        });
        break;

      case "start-chat":
        io.to(map.getSocket(data.message)).emit("server-message", {
          from: "server",
          to: data.message,
          type: "start-chat-request",
          message: null,
        });
        break;

      default:
        console.log(`Unknown type: ${data.type}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}.`);
});
