#!/usr/bin/env node

// Simple y-websocket server wrapper
// Requires `y-websocket` package to be installed in the frontend workspace (apps/dashboard)

const http = require('http')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket')
const port = process.env.PORT || 1234

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('y-websocket server\n')
})

const wss = new WebSocket.Server({ server })

wss.on('connection', (conn, req) => {
  // delegate to y-websocket's helper
  setupWSConnection(conn, req, { gc: true })
})

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`y-websocket server listening on port ${port}`)
})
