# Real-time LLM Progress Tracking

WebSocket-based real-time progress tracking for LLM generation operations.

## Architecture

```
Client (Dashboard/CLI)
    ↓
WebSocket Connection (/ws/llm/{trace_id})
    ↓
ConnectionManager (manages active connections)
    ↑
ProgressBroadcaster (singleton, non-blocking)
    ↑
Gateway / Providers (emit progress events)
```

## Files

### Core Components

1. **`llm_progress.py`** - WebSocket endpoint and connection manager
   - Route: `ws://localhost:8000/ws/llm/{trace_id}`
   - Manages multiple clients per trace_id
   - Handles keepalive (ping/pong)
   - Auto-cleanup of disconnected clients

2. **`progress_broadcaster.py`** - Broadcasting helper
   - `broadcast_llm_progress(trace_id, event, data)` - Async broadcast
   - `broadcast_llm_progress_nowait(trace_id, event, data)` - Fire-and-forget
   - Singleton pattern for app-wide access
   - Non-blocking, error-resilient

### Integration Points

3. **`gateway/api_gateway.py`** - Gateway broadcasts
   - `routing_started` - Initial routing begins
   - `routing_completed` - Provider/model selected
   - `cache_checked` - Cache lookup result
   - `rate_limit_checked` - Rate limit verification
   - `provider_selected` - Final provider confirmed
   - `generation_started` - LLM generation begins
   - `generation_completed` - Generation finished
   - `trace_logged` - Trace saved to database
   - `error` - Error at any phase

4. **`providers/*.py`** - Provider broadcasts
   - `tokens_streaming` - Token streaming progress (every 10 tokens)
   - Integrated in: Ollama, OpenAI, Anthropic, Azure OpenAI

## Event Format

All events follow this structure:

```json
{
  "event": "event_name",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "data": {
    // Event-specific data
  }
}
```

## Standard Events

### routing_started
```json
{
  "event": "routing_started",
  "timestamp": "...",
  "data": {
    "sensitivity": "confidential",
    "cost_target": "minimize",
    "priority": "normal"
  }
}
```

### routing_completed
```json
{
  "event": "routing_completed",
  "timestamp": "...",
  "data": {
    "provider": "ollama",
    "model": "qwen2.5-coder:7b",
    "reason": "sensitivity-based routing"
  }
}
```

### cache_checked
```json
{
  "event": "cache_checked",
  "timestamp": "...",
  "data": {
    "hit": false
  }
}
```

### rate_limit_checked
```json
{
  "event": "rate_limit_checked",
  "timestamp": "...",
  "data": {
    "allowed": true,
    "provider": "ollama"
  }
}
```

### provider_selected
```json
{
  "event": "provider_selected",
  "timestamp": "...",
  "data": {
    "provider": "ollama",
    "model": "qwen2.5-coder:7b",
    "fallback": false
  }
}
```

### generation_started
```json
{
  "event": "generation_started",
  "timestamp": "...",
  "data": {
    "provider": "ollama",
    "model": "qwen2.5-coder:7b",
    "streaming": false
  }
}
```

### tokens_streaming
```json
{
  "event": "tokens_streaming",
  "timestamp": "...",
  "data": {
    "provider": "ollama",
    "model": "qwen2.5-coder:7b",
    "tokens_received": 150
  }
}
```

### generation_completed
```json
{
  "event": "generation_completed",
  "timestamp": "...",
  "data": {
    "provider": "ollama",
    "model": "qwen2.5-coder:7b",
    "input_tokens": 1234,
    "output_tokens": 567,
    "duration_ms": 2500,
    "cost_cents": 0.0,
    "fallback": false
  }
}
```

### trace_logged
```json
{
  "event": "trace_logged",
  "timestamp": "...",
  "data": {
    "trace_id": "trace-abc-123"
  }
}
```

### error
```json
{
  "event": "error",
  "timestamp": "...",
  "data": {
    "error": "rate_limit_exceeded",
    "provider": "openai",
    "message": "Rate limit exceeded"
  }
}
```

Error types:
- `rate_limit_exceeded`
- `provider_not_available`
- `provider_failed`
- `fallback_failed`
- `no_fallback_available`
- `streaming_failed`

## Client Usage

### JavaScript/TypeScript

```javascript
const traceId = 'trace-abc-123';
const ws = new WebSocket(`ws://localhost:8000/ws/llm/${traceId}`);

ws.onopen = () => {
  console.log('Connected to LLM progress stream');
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch(msg.event) {
    case 'connected':
      console.log('Connection confirmed');
      break;
    
    case 'routing_completed':
      console.log(`Routed to ${msg.data.provider}:${msg.data.model}`);
      break;
    
    case 'generation_started':
      console.log('Generation started...');
      break;
    
    case 'tokens_streaming':
      console.log(`Tokens: ${msg.data.tokens_received}`);
      break;
    
    case 'generation_completed':
      console.log(`Done! ${msg.data.output_tokens} tokens in ${msg.data.duration_ms}ms`);
      ws.close();
      break;
    
    case 'error':
      console.error('Error:', msg.data.error, msg.data.message);
      ws.close();
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Connection closed');
};

// Keepalive (optional, every 30s)
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);
```

### Python

```python
import asyncio
import json
import websockets

async def monitor_llm_progress(trace_id: str):
    uri = f"ws://localhost:8000/ws/llm/{trace_id}"
    
    async with websockets.connect(uri) as ws:
        print(f"Connected to trace {trace_id}")
        
        async for message in ws:
            msg = json.loads(message)
            event = msg['event']
            data = msg.get('data', {})
            
            if event == 'generation_completed':
                print(f"✓ Done! {data['output_tokens']} tokens")
                break
            elif event == 'error':
                print(f"✗ Error: {data.get('error')}")
                break
            else:
                print(f"→ {event}: {data}")

# Run
asyncio.run(monitor_llm_progress("trace-abc-123"))
```

## Backend Usage

### From Gateway/Providers

```python
from app.api.websockets.progress_broadcaster import broadcast_llm_progress

# Async context
await broadcast_llm_progress(
    trace_id=ctx.trace_id,
    event="routing_completed",
    data={"provider": "ollama", "model": "qwen2.5-coder:7b"}
)

# Non-blocking (fire-and-forget)
from app.api.websockets.progress_broadcaster import broadcast_llm_progress_nowait

broadcast_llm_progress_nowait(
    trace_id=ctx.trace_id,
    event="cache_checked",
    data={"hit": False}
)
```

## Features

### Non-Blocking
- Uses `asyncio.create_task` for fire-and-forget broadcasts
- Doesn't block main request flow
- Safe to use in hot paths

### Error-Resilient
- Catches and logs exceptions without propagating
- Handles disconnected clients gracefully
- No-op if connection manager unavailable

### Multi-Client Support
- Multiple clients can monitor same trace_id
- Broadcasts to all connected clients
- Automatic cleanup on disconnect

### Monitoring
```python
from app.api.websockets.progress_broadcaster import get_progress_broadcaster

broadcaster = get_progress_broadcaster()
stats = broadcaster.get_stats()

# Returns:
# {
#   "total_traces": 3,
#   "total_connections": 5,
#   "traces": {
#     "trace-1": 2,
#     "trace-2": 1,
#     "trace-3": 2
#   }
# }
```

## Testing

### Manual Test

```bash
# Terminal 1: Start backend
cd apps/backend
make host-api

# Terminal 2: Monitor WebSocket
wscat -c "ws://localhost:8000/ws/llm/test-trace-123"

# Terminal 3: Trigger LLM request
curl -X POST http://localhost:8000/api/v1/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze this code", "trace_id": "test-trace-123"}'

# You should see progress events in Terminal 2
```

### Using wscat

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c "ws://localhost:8000/ws/llm/my-trace-id"

# Send ping
> {"type": "ping"}

# Expected response
< {"event": "pong", "timestamp": "...", "data": {}}
```

## Performance Considerations

1. **Broadcast Frequency**: Token streaming broadcasts every 10 tokens to avoid flooding
2. **Memory**: Connections stored in memory, minimal overhead per client
3. **Cleanup**: Automatic cleanup of disconnected clients
4. **Non-blocking**: Uses async tasks, doesn't impact LLM request performance

## Security

- No authentication on WebSocket endpoint (relies on trace_id knowledge)
- Read-only (clients can't modify LLM execution)
- Rate limiting handled at HTTP API layer
- For production: Add JWT token validation (similar to notifications.py)

## Future Enhancements

- [ ] JWT authentication for WebSocket connections
- [ ] Per-user connection limits
- [ ] Redis pub/sub for multi-instance support
- [ ] Historical event replay for late-joining clients
- [ ] WebSocket compression for large payloads
- [ ] Metrics on broadcast performance
