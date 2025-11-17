# Call App

A real-time audio/video calling application built with React, Vite, and WebRTC. This application enables peer-to-peer voice and video communication with signaling server support using Socket.io.

## Features

- 🎥 Real-time audio/video calling using WebRTC
- 🔌 Socket.io for signaling and real-time communication
- 🌐 RESTful API integration for call management
- 🧊 ICE candidates exchange for NAT traversal
- 👥 Support for caller/receiver roles
- 📊 Connection status monitoring
- 🔄 Call state management (incoming, active, ended)

## Tech Stack

- **Frontend Framework**: React 19.2.0
- **Build Tool**: Vite 7.2.2
- **WebRTC**: Native browser APIs
- **Real-time Communication**: Socket.io Client 4.8.1
- **HTTP Client**: Axios 1.13.2
- **Linting**: ESLint 9.39.1

## Project Structure

```
call app/
├── public/              # Static assets
├── src/
│   ├── assets/          # Images, icons, etc.
│   ├── components/
│   │   └── callPage.jsx # Main WebRTC call component
│   ├── api.js           # Axios API configuration
│   ├── socket.js        # Socket.io client setup
│   ├── App.jsx          # Root component
│   ├── App.css          # App styles
│   ├── index.css        # Global styles
│   └── main.jsx         # Application entry point
├── eslint.config.js     # ESLint configuration
├── vite.config.js       # Vite configuration
├── package.json         # Dependencies and scripts
└── README.md
```

## Prerequisites

Before running this application, ensure you have:

- **Node.js** (v14 or higher)
- **npm** or **yarn**
- A **backend server** with:
  - Socket.io server running (default: `http://localhost:3000`)
  - REST API endpoints at `http://localhost:3000/api/v1/call`
  - STUN/TURN server configuration (for production)

## Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd "call app"
```

2. **Install dependencies**:
```bash
npm install
```

3. **Configure backend URLs**:

Edit `src/api.js`:
```javascript
export const API_BASE = "http://localhost:3000/api/v1/call";

function getAuthToken() {
  return "your-auth-token"; // Add your authentication token
}
```

Edit `src/socket.js`:
```javascript
const SOCKET_URL = "http://localhost:3000";
```

4. **Update user IDs** in `src/App.jsx`:
```jsx
<CallPage currentUserId="user1" targetUserId="user2"/>
```

## Usage

1. **Start the development server**:
```bash
npm run dev
```

2. **Open in browser**: Navigate to `http://localhost:5173` (or the URL shown in terminal)

3. **Test calling**:
   - Open two browser tabs/windows
   - Set different `currentUserId` for each instance
   - Click "Start Call" on one tab (caller)
   - The other tab will receive the incoming call (receiver)

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint to check code quality

## API Endpoints

The application expects the following REST API endpoints on the backend:

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| `POST` | `/api/v1/call/` | Create a new call | `{ recipientId: string }` |
| `PUT` | `/api/v1/call/` | Update call with offer | `{ callId: string, offer: RTCSessionDescription }` |
| `PUT` | `/api/v1/call/accept` | Accept call with answer | `{ callId: string, answer: RTCSessionDescription }` |
| `POST` | `/api/v1/call/sendIceCandidate` | Send ICE candidate | `{ callId: string, profileId: string, candidate: RTCIceCandidate }` |
| `PUT` | `/api/v1/call/end` | End the call | `{ callId: string }` |

## Socket Events

### Client Listens For:

- `incomingCall` - Notifies when receiving a call
  ```javascript
  { callerId, recipientId, callId, offer }
  ```
- `answer` - Receives answer from callee
  ```javascript
  { callId, answer }
  ```
- `iceCandidate` - Receives ICE candidates from peer
  ```javascript
  { callId, candidate }
  ```
- `endCall` - Notifies when call is ended
  ```javascript
  { callId }
  ```

### Client Emits:

- `registerUser` - Register user with their ID
  ```javascript
  { userId }
  ```

## WebRTC Configuration

The app uses Google's public STUN server for NAT traversal:

```javascript
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};
```

**For Production**: Add TURN servers for better connectivity:
```javascript
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:your-turn-server.com:3478",
      username: "username",
      credential: "password"
    }
  ]
};
```

## Troubleshooting

### "NotFoundError: Requested device not found"

This error occurs when the browser cannot access camera/microphone:

**Solutions**:
1. Grant camera/microphone permissions in browser settings
2. Ensure you're on HTTPS or localhost (HTTP blocks media access)
3. Check if another application is using the device
4. Verify devices are connected: `navigator.mediaDevices.enumerateDevices()`

### Connection Issues

1. Ensure backend server is running
2. Check CORS settings on backend
3. Verify Socket.io connection in browser console
4. For production, configure TURN servers

### Audio/Video Not Working

1. Check browser compatibility (Chrome, Firefox, Safari, Edge)
2. Ensure `autoPlay` attribute is set on video elements
3. Check if media tracks are properly added to peer connection
4. Verify remote stream is set to video element

## Browser Support

- ✅ Chrome/Edge (Chromium) 60+
- ✅ Firefox 55+
- ✅ Safari 11+
- ✅ Opera 47+

## Security Considerations

- Always use HTTPS in production
- Implement proper authentication/authorization
- Validate user permissions before initiating calls
- Use secure WebSocket connections (WSS)
- Implement rate limiting on API endpoints

## Future Enhancements

- [ ] Group calling support
- [ ] Screen sharing functionality
- [ ] Chat messaging during calls
- [ ] Recording capabilities
- [ ] Call history and logs
- [ ] Push notifications for incoming calls
- [ ] Mobile responsive UI

## License

MIT License

Copyright (c) 2025 Call App

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

