#!/usr/bin/env node

const http = require("node:http")
const WebSocket = require("ws")
const { setupWSConnection } = require("y-websocket")

const port = Number(process.env.PORT || "1234")

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" })
  res.end("y-websocket server\n")
})

const wss = new WebSocket.Server({ server })

wss.on("connection", (conn, req) => {
  setupWSConnection(conn, req, { gc: true })
})

server.listen(port, () => {
  console.log(`y-websocket server listening on port ${port}`)
})
