# Tic Tac Toe Online + Voice Chat

A beginner-friendly multiplayer Tic Tac Toe starter using Node.js, Express, Socket.IO and WebRTC audio.

## Requirements
- Node.js 18 or newer
- Two browser tabs/devices
- Microphone permission for voice chat

## Run on Windows 11
1. Install Node.js LTS from https://nodejs.org/
2. Extract this ZIP.
3. Open the extracted `tic_tac_toe_voice` folder.
4. Click the folder address bar in File Explorer, type `cmd`, and press Enter.
5. Run:
   ```bash
   npm install
   npm start
   ```
6. Open http://localhost:3000 in your browser.
7. Create a room, then open the same URL in another browser/device and join using the room code.

## Test with two devices on the same Wi-Fi
Find your PC's local IPv4 address with `ipconfig`. On the second device open:
`http://YOUR-PC-IP:3000`
Allow Node.js through Windows Firewall on private networks if prompted.

## Important deployment notes
- Microphone access requires `localhost` or HTTPS. Use HTTPS when deploying publicly.
- The included public STUN server helps browsers discover network paths. Some networks require a TURN server for reliable audio; add a TURN service for production.
- This is a learning starter, not a hardened production service. Add rate limits, stronger room lifecycle handling, authentication if needed, and robust WebRTC reconnection before public launch.
- Room state is stored in server memory, so restarting the server clears rooms.

## Custom board and winning rules
Choose a 3x3, 5x5, 7x7, 10x10, or 15x15 board and a connect target from 3 up to the board size. The room creator sets the rules; the joining player automatically uses them. Winning cells stay highlighted, and the opponent's latest move flashes briefly.
